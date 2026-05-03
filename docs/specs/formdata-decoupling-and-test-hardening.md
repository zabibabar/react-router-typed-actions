# FormData Decoupling and Test Hardening

## Problem Statement

The tight coupling between serialization and registration, combined with test coverage gaps and unnecessary `any` suppressions, create friction:

1. **Serialization–registration coupling.** `createFormData` calls `getDefinition(type)` solely to read `def.method`. This forces the action to be registered before serialization, which prevents standalone usage (tests, TanStack Query paths) without mounting an `ActionsProvider` first. The `ActionCreator` already carries `type` and `method` as readonly properties — the registry lookup is unnecessary.

2. **Test coverage gaps.** The v2 code review identified untested behavioral paths: the event lifecycle system (`debug`, `onAction`), the error-path `withMetaOverrides` catch branch, method passthrough for non-POST actions via `createFormData`, and `pendingPayload` during submission.

3. **`any` suppressions.** Nine `eslint-disable` comments for `@typescript-eslint/no-explicit-any` across the source files. Some are justified (existential erasure at module boundaries), but others can be replaced with targeted type assertions.

## Solution

Decouple `createFormData` from the registry so serialization works independently of registration state. Fill test coverage gaps. Reduce `any` suppressions with targeted type assertions.

## Implementation Decisions

### 1. `createFormData` decoupling — accept an `ActionCreator`

**What it does:** Removes the `getDefinition(type)` call from `createFormData`. Instead of accepting `(type, payload)` and looking up the definition, it accepts the `ActionCreator` directly and reads `type` and `method` from it.

**Why it exists:** Serialization is a pure data transformation (creator + payload → FormData). It should not depend on registration state. The `ActionCreator` already carries `type` and `method` as readonly properties, so no lookup is needed.

**Contract signatures:**

```typescript
export function createFormData(
  creator: ActionCreator,
  payload: unknown,
): { formData: FormData; method: ActionMethod };
```

The function reads `creator.type` and `creator.method` directly off the object. No registry access.

**Interaction with other modules:**
- `useAction` in `adapter.tsx` changes from `createFormData(act.type, payload)` to `createFormData(act, payload)`.
- `resolveFormData` is unchanged — it still needs the registry to reconstruct the full `ActionObject` (which requires the definition's `resolve` function, not just identity properties).

### 2. Type safety pass — reduce `any` suppressions

**What it does:** Replaces `any` casts with targeted type assertions or generics where the type information exists but TypeScript's inference doesn't reach.

**Specific targets:**

- **`define-action.ts:91`** — `(config as any).meta`: Replace with a type assertion to `{ meta?: TMeta }` via a conditional helper type that extracts `meta` from the config union. The current `any` exists because the conditional type `[TMeta] extends [void] ? { meta?: never } : { meta: TMeta }` makes direct `.meta` access awkward. A targeted assertion (e.g. `(config as { meta?: TMeta }).meta`) eliminates the `any` without losing safety.

- **`define-action.ts:95-96`** — The cast on the creator function: Evaluate whether restructuring `buildActionObject`'s return type or using a generic call signature can eliminate the `as ActionCreator<...>` cast through `any`.

- **Registry and adapter `any` on `ActionCreator` arrays:** These are existential erasure at module boundaries (heterogeneous collections of differently-typed creators). These `any` casts are justified and should remain with comments explaining why.

The goal is to reduce the count from 9 to the irreducible minimum (estimated 4-5 at module boundaries) and ensure every remaining suppression has a comment explaining why it's necessary.

### 3. Test hardening — fill coverage gaps

**What to test:**

#### a) Event lifecycle (`adapter.test.tsx`)

- `<ActionsProvider debug onAction={spy}>` → `spy` called with `ActionEvent` matching `{ phase: "submit", type, name, payload, timestamp }` on submit.
- After round-trip → `spy` called with `{ phase: "success", type, name, result, duration, timestamp }`.
- Error path → `spy` called with `{ phase: "error", type, name, error, duration, timestamp }`.
- `debug={true}` → `console.groupCollapsed` is called (spy on console).
- No listeners (`debug={false}`, no `onAction`) → `emitEvent` is `null` in context (verify via implementation detail check or observable behavior).

#### b) Error-path meta overrides (`factory.test.ts`)

The existing `dynamicErrorAction` fixture returns `withMetaOverrides(null, ...)` — it doesn't throw. The `catch` branch in `buildActionObject.resolve()` that handles thrown `MetaOverrideResult` is untested.

Add a fixture:

```typescript
const throwingMetaAction = defineAction<
  "throwingMeta",
  { name: string },
  never,
  void,
  ToastMeta
>({
  type: "throwingMeta",
  resolve: (payload) => {
    throw withMetaOverrides(new Error(`${payload.name} exploded`), {
      errorMessage: `${payload.name} failed dynamically`,
    });
  },
  meta: {
    successMessage: "Default success",
    errorMessage: "Default error",
  },
});
```

Test that after `resolve` throws:
- The thrown value is the unwrapped error (not the `MetaOverrideResult` wrapper).
- `action.meta.errorMessage` reflects the dynamic override.
- `action.meta.successMessage` retains the static default.

#### c) Method passthrough for non-POST actions (`factory.test.ts`)

Test that `createFormData(deleteItem, { id: "1" })` produces `method === "DELETE"`. The `deleteItem` fixture exists but its method is only tested through `resolveFormData`, not through `createFormData` directly.

#### d) `pendingPayload` during submission (`adapter.test.tsx`)

Test that `pendingPayload` is defined during the submitting state and `undefined` after settlement. This requires capturing state during the fetcher's in-flight phase.

### Design Rationale

- **DIP applied:** `createFormData` currently depends on the concrete registry to get the method. After decoupling, it reads directly from the `ActionCreator` passed by the caller. The low-level serialization module no longer depends on the high-level registration module.
- **SRP restored:** `createFormData` goes from two reasons to change (serialization format AND registry strategy) to one (serialization format).
- **Facade preserved:** `useAction` remains the thin orchestrator that wires registry + form-data + fetcher. The refactor pushes coordination up to this facade layer where it belongs, keeping the lower-level modules focused.

## Testing Decisions

- **Test external behavior, not implementation details.** Event lifecycle tests should assert on observable spy calls, not internal state.
- **Prior art:** The existing test suite is well-structured with AAA pattern, behavioral assertions, and type-level tests. New tests should follow the same conventions — fixtures at the top, describe blocks grouped by concern, `beforeEach`/`afterEach` for setup/teardown.
- **Modules to test:**
  - `createFormData` — accepts `ActionCreator` directly (new signature), no longer requires registration.
  - Event lifecycle — submit/success/error phases, debug logger, no-listener path.
  - Error-path meta overrides — thrown `MetaOverrideResult` unwrapping and meta merge.
  - `pendingPayload` — populated during submission, cleared after settlement.
- **Boundary mocking:** Continue the existing pattern of using `createMemoryRouter` with real route actions for adapter tests. No internal function mocking.

## Out of Scope

- **`ActionObject.resolve` return type change** (`Promise<unknown>` → `Promise<TResult>`). This is an API design decision that would break the handler-side type contract. Requires a separate design discussion about whether `ActionObject` should carry `TResult` and the implications for the route handler recipe.
- **`defaultDebugLogger` improvements** (L1 from review — `console.group` vs `console.groupCollapsed`). Cosmetic; can be addressed independently.
- **`MetaOverrideResult` symbol visibility** (L2 from review). Cosmetic; the symbol-based branding is the correct approach.
- **`joinPath` dot-notation edge case** (L3 from review). Pathological input scenario; no real-world impact.
- **Registry refactoring** (replacing the global singleton with a class-based or scoped registry). The global `Map` singleton in `registry.ts` remains as-is. SSR safety and test isolation improvements to the registry are a separate scope.

## Further Notes

The `createFormData` signature change is a **breaking change** for any consumer calling `createFormData` directly (rather than through `useAction`). It changes from `(type: string, payload: unknown)` to `(creator: ActionCreator, payload: unknown)`. The README documents `createFormData` in the API reference table, and `factory.test.ts` calls it extensively. All call sites within the library and test suite must be updated atomically.
