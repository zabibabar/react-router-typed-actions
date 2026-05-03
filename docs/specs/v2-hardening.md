# v2 Hardening

## Problem Statement

The v2 refactor introduced a clean architecture — callable ActionCreators, generic TMeta, SuperJSON serialization, a global registry, and a React Router adapter. The core design is sound, but a staff-level review surfaced issues that would cause friction for adopters and subtle bugs in production:

1. **The README documents a different API than the code implements.** Every code example in the README uses v1 field names (`successMessage`, `errorMessage`, `pending`, `withMessageOverrides`, lowercase HTTP methods). An adopter following the README will fail on first use.

2. **Internal implementation details leak through `any` casts.** The `_definition` property is attached to ActionCreators as a hidden string key and accessed via `(creator as any)._definition` in the registry. This couples two modules through an invisible, untyped channel.

3. **The React adapter has standard stale-closure and referential-stability gaps.** `onSuccess`/`onError` callbacks can fire stale versions, `submit` is recreated every render, and `ActionsProvider` re-registers all actions if the consumer passes an unstable array reference.

4. **File-level `eslint-disable` for `no-explicit-any` across 3 source files** means future edits won't be caught by the linter.

5. **Recursive serialization has no depth guard**, risking stack overflow on pathological inputs.

None of these are architectural — the module boundaries, type design, and patterns are correct. This is a hardening pass to bring the codebase to open-source quality.

## Solution

Address all review findings in a single focused pass: fix the definition store, stabilize the React adapter, tighten lint rules, add a serialization depth guard, and rewrite the README. The public API surface does not change — all fixes are internal or documentation.

## Implementation Decisions

### Module 1: Definition Store

**What it does:** Replaces the leaky `_definition` string property with a `WeakMap`-based private store, co-located with `defineAction`. Provides a typed accessor function that the registry uses instead of an `any` cast.

**Why it exists:** The v1 codebase (still live in `brand-cmp-ui`) used `Symbol.for("react-router-actions:definition")` to store the definition — better than a string key, but still a property on the creator function that's accessible to anyone who imports the symbol. The v2 regressed to a plain string property (`_definition`). A `WeakMap` is strictly cleaner: no property pollution on the creator, no `any` cast to read it, automatic GC when the creator is unreferenced, and truly private (no exported symbol or key).

**Contract signatures:**

```typescript
// define-action.ts — private module state
const definitionStore = new WeakMap<Function, ActionDefinition>();

// define-action.ts — public accessor
export function getDefinitionFor(
  creator: ActionCreator,
): ActionDefinition | undefined;

// define-action.ts — inside defineAction()
// Instead of: Object.assign(creator, { _definition: definition })
// Do: definitionStore.set(creator, definition)
```

```typescript
// registry.ts — registerActions()
// Instead of: const def = (creator as any)._definition as ActionDefinition
// Do: const def = getDefinitionFor(creator)
// Throw if undefined (creator wasn't produced by defineAction)
```

**Files changed:** `src/define-action.ts`, `src/registry.ts`

**Tests affected:** `src/__tests__/define-action.test.ts` (remove tests that reach into `_definition` via `any`), `src/__tests__/factory.test.ts` (no change — tests use the public API which still works)

### Module 2: Adapter Stability

**What it does:** Fixes three referential-stability issues in the React adapter:

1. **Latest-ref pattern for effect captures.** The `useEffect` that fires `onSuccess`/`onError` captures `options`, `emitEvent`, and `action` from the closure but only depends on `[fetcher.data]`. If these captures change between renders, the effect fires stale versions. Fix: store all three in a ref that updates on every render; read from the ref inside the effect.

2. **Stable `submit` function.** The `submit` closure is recreated every render because it captures `emitEvent`, `action`, and `options`. Fix: read these from the latest-ref inside `submit` and wrap it in `useCallback` with an empty dependency array (since all captures come from the ref).

3. **Action type-key memoization in `ActionsProvider`.** The `useEffect` with `[actions]` dependency re-registers on every render if the consumer passes a new array reference. Fix: derive a stable key from the sorted action type strings and use that as the effect dependency instead of the array reference. This is safe because action definitions are module-level constants — the type string uniquely identifies the definition.

**Why it exists:** These are standard React hook stability patterns that production libraries (TanStack Query, React Router itself) apply. Without them, consumers who pass dynamic callbacks or inline arrays will hit stale closures or wasted re-registrations.

**Contract signatures:**

```typescript
// adapter.tsx — latest-ref pattern
interface LatestRef<TResult, TPayload, TContext, TMeta> {
  options: UseActionOptions<TResult> | undefined;
  emitEvent: ActionEventHandler | null;
  action: ActionCreator<string, TPayload, TResult, TContext, TMeta>;
}

// The ref updates every render:
// latestRef.current = { options, emitEvent, action };

// The effect reads from the ref:
// latestRef.current.options?.onSuccess?.(data.response);

// submit is stable:
// const submit = useCallback((payload: TPayload) => {
//   const { emitEvent, action, options } = latestRef.current;
//   ...
// }, []);
```

```typescript
// adapter.tsx — ActionsProvider type-key memoization
// Derive a stable string from action types:
// const typeKey = useMemo(
//   () => actions.map(a => a.type).sort().join('\0'),
//   [actions],
// );
// Use typeKey (not actions) as the useEffect dependency.
```

**Files changed:** `src/adapter.tsx`

**Tests affected:** `src/__tests__/adapter.test.tsx` — existing tests should continue to pass. Consider adding a test that verifies `submit` referential stability across re-renders (same function reference when action hasn't changed).

### Module 3: Lint Hygiene

**What it does:** Replaces file-level `/* eslint-disable @typescript-eslint/no-explicit-any */` with per-line `// eslint-disable-next-line @typescript-eslint/no-explicit-any` on the specific lines that require `any`.

**Why it exists:** File-level disables mean any new `any` introduced in future edits won't be caught. For a library that markets "type-safe mutations," this is a quality signal. The actual `any` usages are legitimate (generic bridging at type boundaries), but the disable scope should match the usage scope.

**Files changed:** `src/define-action.ts`, `src/action-object.ts`, `src/form-data.ts`

**Inventory of `any` usages to keep (per file):**

- `define-action.ts`: `(config as any).meta` (conditional type workaround), `ActionDefinition<string, any, any, TContext, TMeta>` (generic widening for the `buildActionObject` call). After Module 1, the `_definition` `any` cast is removed.
- `action-object.ts`: `ActionDefinition<string, any, any, TContext, TMeta>` parameter type (generic boundary for `buildActionObject`).
- `form-data.ts`: `ActionObject<any, any>` return type of `resolveFormData` (type erasure at the FormData boundary), `any` in `registry` import types.

**Tests affected:** None — lint-only change.

### Module 4: Defensive Serialization

**What it does:** Adds a `MAX_DEPTH` constant (32) to `serialization.ts` and enforces it in both `extractFiles` and `reinsertFiles`. Throws a descriptive error if exceeded.

**Why it exists:** Both functions recurse without a depth limit. While real-world payloads are shallow, a library should not stack-overflow on pathological input. The depth limit is a safety net, not a functional constraint.

**Contract signatures:**

```typescript
// serialization.ts
const MAX_DEPTH = 32;

function extractFiles(
  value: unknown,
  path: string,
  files: FileEntry[],
  depth?: number, // defaults to 0, throws at MAX_DEPTH
): unknown;

function reinsertFiles(
  value: unknown,
  fileMap: Map<string, File | Blob>,
  depth?: number,
): unknown;
```

**Files changed:** `src/serialization.ts`

**Tests affected:** `src/__tests__/serialization.test.ts` — add one test that verifies the depth guard throws on a payload nested beyond `MAX_DEPTH`.

### Module 5: Documentation Alignment

**What it does:** Rewrites `README.md` to accurately document the v2 API.

**Why it exists:** The README currently documents the v1 API from `brand-cmp-ui`. Every code example is wrong for v2.

**Changes required (non-exhaustive):**

| Section | v1 (current README) | v2 (correct) |
|---------|---------------------|--------------|
| `defineAction` config | `successMessage`, `errorMessage` as top-level fields | `meta: { successMessage, errorMessage }` with generic `TMeta` |
| Dynamic overrides | `withMessageOverrides(data, overrides)` | `withMetaOverrides(data, overrides)` |
| `useAction` return | `{ pending }` | `{ state, data, pendingPayload }` |
| HTTP methods | lowercase (`"post"`, `"delete"`) | uppercase (`"POST"`, `"DELETE"`) |
| API Reference table | `MessageFactory<TPayload>` type | Remove — replaced by generic `TMeta` |
| Toast recipe | `action.successMessage` | `action.meta.successMessage` (or custom `TMeta` shape) |
| Factory | `ActionsProvider` "builds the factory" | `ActionsProvider` "registers actions and provides context" |

The README structure (Problem → Quick Start → Optional Fields → Recipes → API Reference) is good and should be preserved. The prose is well-written — only the code examples and API descriptions need updating.

**Files changed:** `README.md`

**Tests affected:** None.

### Module 6: Minor Polish

**What it does:** Two small fixes:

1. **Boolean coercion for `hasListeners`** in `adapter.tsx`:
   ```typescript
   // Before: const hasListeners = debug || onAction;
   // After:  const hasListeners = debug || !!onAction;
   ```

2. **JSDoc on `ActionObject.meta`** in `action-object.ts` documenting the temporal behavior — meta returns static values before `resolve()` is called, and merged dynamic overrides after.

**Files changed:** `src/adapter.tsx`, `src/action-object.ts`

**Tests affected:** None.

### Design Rationale

**Principles applied:**

- **DIP (Dependency Inversion):** Module 1 inverts the dependency between `registry.ts` and `define-action.ts`. Instead of the registry reaching into the creator's internals, it calls a typed accessor that `define-action.ts` owns. The abstraction boundary is now explicit.
- **Encapsulate what varies:** Module 1 (WeakMap hides storage mechanism), Module 2 (latest-ref hides callback instability from the effect).
- **Program to an interface, not an implementation:** Module 1 replaces `any`-cast property access with a typed function call.
- **ISP (Interface Segregation):** Module 3 — narrowing eslint-disable scope to specific lines instead of entire files.

**Patterns preserved:**

- **Factory pattern** in `defineAction` — unchanged.
- **Adapter pattern** in `adapter.tsx` — strengthened with stable references.
- **Registry pattern** in `registry.ts` — interface to it changes (uses `getDefinitionFor` instead of `any` cast), but the registry itself is unchanged.

## Testing Decisions

**What makes a good test:** Tests should assert on external behavior visible to the consumer — the shape of returned objects, the result of calling functions, the timing of callbacks. They should NOT assert on internal storage mechanisms (e.g., "the WeakMap contains X") or implementation details (e.g., "useCallback was called").

**Modules to test:**

| Module | Test strategy |
|--------|--------------|
| Definition store | Existing `define-action.test.ts` and `factory.test.ts` should pass unchanged (they test public API). Remove tests that reach into `(creator as any)._definition`. Add a test that `getDefinitionFor` returns undefined for a non-`defineAction` function. |
| Adapter stability | Existing `adapter.test.tsx` integration tests should pass unchanged. Add a test verifying `submit` referential stability across re-renders. |
| Lint hygiene | No runtime tests — verify via `yarn lint`. |
| Defensive serialization | Add one test: deeply nested payload (depth > 32) throws with a descriptive message. |
| Documentation | No automated tests — manual review. |
| Minor polish | No new tests — existing coverage is sufficient. |

**Prior art:** The existing test suite is the model. It uses `vitest`, `@testing-library/react`, `createMemoryRouter` / `RouterProvider` for integration tests, and `expectTypeOf` for type-level assertions. New tests should follow these patterns.

## Out of Scope

- **SSR support for the global registry.** The singleton `_globalRegistry` in `registry.ts` shares state across concurrent server requests. Fixing this requires either a context-scoped registry or a request-scoped store, which is a design change beyond a hardening pass. Documented as a known limitation for future work.
- **Public API changes.** No exports are added, removed, or have their signatures changed. The `getDefinitionFor` function is exported but is an addition, not a breaking change.
- **Migration tooling from v1 to v2.** The `brand-cmp-ui` consumer still uses v1 (`successMessage`/`errorMessage`, `createActionsFactory`, `JSON.stringify`). Migration is a separate effort.
- **Additional test coverage for concurrent submissions, race conditions, or overlapping `useAction` calls.** Valuable but not part of this hardening scope.

## Further Notes

The v1 codebase in `brand-cmp-ui` used `Symbol.for("react-router-actions:definition")` to store definitions on creators — a better approach than v2's `_definition` string key. The spec recommends `WeakMap` over Symbol because it provides true privacy (no property on the object at all) and eliminates the `any` cast entirely. If there's a future need for cross-realm definition access (e.g., micro-frontends sharing action creators across bundles), `Symbol.for` can be reconsidered.

The `superjson` dependency (~2KB gzipped) is the only runtime dependency. This is reasonable for the functionality it provides (Date, Map, Set, BigInt, RegExp, undefined, NaN, Infinity round-tripping).

All 79 existing tests pass as of the review. The hardening changes should not break any existing test — if they do, the change is wrong, not the test.
