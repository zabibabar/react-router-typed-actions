# v2 Hardening — Tasks

> Spec: [v2 Hardening](./v2-hardening.md)
> **Feature status:** committed

### 1. Definition Store — WeakMap refactor (AFK)
Replace the `_definition` string property with a `WeakMap`-based private store in `define-action.ts` and update `registry.ts` to use the new typed accessor.

**Status:** committed
**Blocked by:** None — can start immediately
**Not this task:** Adapter stability (Task 2), lint hygiene (Task 4), README (Task 5)

**Done when:**
- `define-action.ts` has a module-private `const definitionStore = new WeakMap<Function, ActionDefinition>()` and no longer attaches `_definition` via `Object.assign`
- `define-action.ts` exports `getDefinitionFor(creator): ActionDefinition | undefined` that reads from the WeakMap
- `registry.ts` imports and calls `getDefinitionFor` instead of `(creator as any)._definition`
- `registry.ts` throws a descriptive error when `getDefinitionFor` returns `undefined` (creator not produced by `defineAction`)
- Tests in `define-action.test.ts` that reached into `(creator as any)._definition` are updated to use `getDefinitionFor` or removed if they only tested the storage mechanism
- A new test verifies `getDefinitionFor` returns `undefined` for a plain function (not from `defineAction`)
- All 79 existing tests pass: `yarn test`

---

### 2. Adapter Stability — latest-ref, stable submit, type-key memo (AFK)
Fix three referential-stability issues in `adapter.tsx`: stale closures on callbacks, unstable `submit` reference, and provider re-registration on array reference changes. Also fix the `hasListeners` boolean coercion (spec Module 6, item 1).

**Status:** committed
**Blocked by:** None — can start immediately (independent of Task 1)
**Not this task:** Definition store (Task 1), lint cleanup (Task 4), README (Task 5)

**Done when:**
- `useAction` stores `options`, `emitEvent`, and `action` in a ref (`latestRef`) that updates every render
- The `useEffect` that fires `onSuccess`/`onError` reads from `latestRef.current` instead of closure captures
- `submit` is wrapped in `useCallback` with an empty dependency array, reading all captures from `latestRef.current`
- `ActionsProvider` derives a stable type-key string from `actions.map(a => a.type).sort().join('\0')` via `useMemo` and uses it as the `useEffect` dependency instead of the `actions` array reference
- `const hasListeners = debug || onAction` is changed to `const hasListeners = debug || !!onAction`
- A new test verifies `submit` referential stability: the function reference returned by `useAction` is the same across re-renders when the action hasn't changed
- All existing adapter tests pass: `yarn test src/__tests__/adapter.test.tsx`
- All 79 tests pass: `yarn test`

---

### 3. Defensive Serialization — depth guard (AFK)
Add a `MAX_DEPTH` constant to `serialization.ts` and enforce it in both recursive functions.

**Status:** committed
**Blocked by:** None — can start immediately (independent of Tasks 1–2)
**Not this task:** Definition store (Task 1), adapter stability (Task 2), lint cleanup (Task 4)

**Done when:**
- `serialization.ts` has `const MAX_DEPTH = 32`
- `extractFiles` accepts an optional `depth` parameter (default 0), increments on each recursive call, and throws a descriptive error when `depth >= MAX_DEPTH`
- `reinsertFiles` applies the same depth guard
- A new test in `serialization.test.ts` constructs a payload nested deeper than 32 levels and asserts that `serialize` throws with a message containing "depth" or "MAX_DEPTH"
- All existing serialization tests pass: `yarn test src/__tests__/serialization.test.ts`

---

### 4. Lint Hygiene + JSDoc (AFK)
Replace file-level `eslint-disable` with per-line disables across 3 files. Add JSDoc on `ActionObject.meta` documenting temporal behavior (spec Module 6, item 2).

**Status:** committed
**Blocked by:** 1, 2 — the `any` inventory in `define-action.ts` and `adapter.tsx` changes after Tasks 1 and 2
**Not this task:** Structural code changes (Tasks 1–3), README (Task 5)

**Done when:**
- `define-action.ts`, `action-object.ts`, and `form-data.ts` no longer have `/* eslint-disable @typescript-eslint/no-explicit-any */` at the top
- Each remaining `any` usage has an inline `// eslint-disable-next-line @typescript-eslint/no-explicit-any` immediately above it
- No new `any` usages are introduced
- `ActionObject.meta` getter in `action-object.ts` has a JSDoc comment explaining that it returns static meta before `resolve()` is called and merged dynamic overrides after
- `yarn test` passes (all tests)
- `yarn typecheck` passes

---

### 5. README Rewrite (AFK)
Rewrite `README.md` to accurately document the v2 API surface, using the diff table from the spec as a checklist.

**Status:** committed
**Blocked by:** 1, 2, 3, 4 — README should reflect the final code state
**Not this task:** Any code changes — this task only modifies `README.md`

**Done when:**
- All `defineAction` examples use `meta: { ... }` with generic `TMeta` instead of top-level `successMessage`/`errorMessage`
- `withMessageOverrides` is replaced with `withMetaOverrides` everywhere
- `useAction` return examples use `{ state, data, pendingPayload }` instead of `{ pending }`
- HTTP methods are uppercase (`"POST"`, `"DELETE"`) in all examples
- The API Reference table removes `MessageFactory<TPayload>` and `withMessageOverrides`, adds `withMetaOverrides`, `isMetaOverride`, `MetaOverrideResult`, and documents the `TMeta` generic
- The toast recipe uses `action.meta.successMessage` (or equivalent custom `TMeta` shape) instead of `action.successMessage`
- The `ActionsProvider` description says "registers actions and provides context" instead of "builds the factory"
- The Quick Start, Optional Fields, Handler Recipe, Toast Recipe, Optimistic UI, Auth and Context, TanStack Query, Server Actions, and Serialization sections all compile against the v2 API (no references to v1 types or patterns remain)
- The README structure is preserved: Problem → Quick Start → Optional Fields → Recipes → API Reference → License
