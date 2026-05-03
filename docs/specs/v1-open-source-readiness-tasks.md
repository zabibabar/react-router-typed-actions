# v1 Open-Source Readiness Refactor — Tasks

> Spec: [v1 Open-Source Readiness Refactor](./v1-open-source-readiness.md)
> **Feature status:** committed

### 1. Generalize meta override mechanism (AFK)
Rename `with-message-overrides.ts` to `with-meta-overrides.ts` and generalize from hardcoded `MessageOverrides` to `Partial<TMeta>`.

**Status:** committed
**Blocked by:** None — can start immediately
**Not this task:** `defineAction` changes (Task 2), `buildActionObject` changes (Task 3), factory/adapter changes (Tasks 4–5), test updates for other modules (Tasks 2–5)

**Done when:**
- `with-message-overrides.ts` is deleted and replaced by `with-meta-overrides.ts`
- Implements the `withMetaOverrides`, `isMetaOverride`, and `MetaOverrideResult` contracts from the spec
- Symbol renamed from `react-router-actions:message-override` to `react-router-actions:meta-override`
- `src/__tests__/with-message-overrides.test.ts` renamed to `src/__tests__/with-meta-overrides.test.ts` and updated: fixtures use arbitrary `TMeta` shapes (not just `{ successMessage, errorMessage }`), all existing discrimination and duck-type tests preserved
- All tests in the renamed file pass
- No other source files modified in this task (import updates happen in Tasks 2–3)

---

### 2. Refactor action definition to use TMeta (AFK)
Add the `TMeta` generic parameter and `meta` config key to `defineAction`, `ActionCreator`, and `ActionDefinition`. Remove `successMessage`, `errorMessage`, and `MessageFactory`.

**Status:** committed
**Blocked by:** 1
**Not this task:** `ActionObject` / `buildActionObject` changes (Task 3), factory changes (Task 4), adapter changes (Task 5), barrel export updates (Task 6)

**Done when:**
- Implements the `ActionDefinition`, `ActionCreator`, and `defineAction` contracts from the spec (Module 1)
- `MessageFactory` type is deleted
- `successMessage` and `errorMessage` fields removed from `defineAction` config and `ActionDefinition`
- `TMeta` defaults to `void`; when `void`, the `meta` config key is absent from the type
- `ActionCreator` carries `TMeta` as its fifth generic parameter
- Internal `_definition` stored on the creator includes `meta`
- `src/__tests__/define-action.test.ts` updated: fixtures use `meta` instead of `successMessage`/`errorMessage`; type inference tests verify `TMeta` propagation; `TContext` conditional resolve tests preserved
- All tests pass
- No changes to `action-object.ts`, `factory.ts`, or `adapter.tsx` in this task

---

### 3. Refactor ActionObject to use generic meta (AFK)
Replace `successMessage`/`errorMessage` getters and `ActionObjectOptions` with a generic `meta` getter on `ActionObject`. Wire `buildActionObject` to use `isMetaOverride` for dynamic meta resolution.

**Status:** committed
**Blocked by:** 1, 2
**Not this task:** Factory `createFormData`/`resolveFormData` signature changes (Task 4), adapter/provider changes (Task 5), barrel export updates (Task 6)

**Done when:**
- Implements the `ActionObject`, `ActionResult`, and `buildActionObject` contracts from the spec (Module 2)
- `ActionObjectOptions` interface is deleted
- `resolveMessage` helper is deleted
- `successMessage` and `errorMessage` getters removed from the built object
- `meta` getter returns static `TMeta` before `resolve` runs, and `{ ...staticMeta, ...dynamicOverrides }` after `resolve` returns a `withMetaOverrides`-wrapped value
- Import updated from `isMessageOverride` to `isMetaOverride` (from the file created in Task 1)
- `src/__tests__/factory.test.ts` `withMessageOverrides` section updated to use `withMetaOverrides` and verify `meta` getter behavior instead of `successMessage`/`errorMessage` getters
- All tests pass

---

### 4. Thread TMeta through factory and remove options (AFK)
Add the `TMeta` generic to `ActionsFactory` and `createActionsFactory`. Remove `ActionObjectOptions` from `createFormData` and the `options` FormData field from `resolveFormData`.

**Status:** committed
**Blocked by:** 2, 3
**Not this task:** Adapter/provider changes (Task 5), barrel export updates (Task 6)

**Done when:**
- Implements the `ActionsFactory` and `createActionsFactory` contracts from the spec (Module 5)
- `createFormData` no longer accepts an `options` parameter
- `createFormData` no longer writes an `options` field to `FormData`
- `resolveFormData` no longer reads or parses an `options` field from `FormData`
- `buildActionObject` called without `options` argument
- `src/__tests__/factory.test.ts` updated: remove any `ActionObjectOptions`-related tests; add round-trip tests that verify `meta` survives `createFormData` → `resolveFormData`; existing round-trip, error, and edge-case tests preserved
- All tests pass

---

### 5. Multi-provider architecture and useAction state alignment (AFK)
Replace the singleton `_factory` with a global additive registry and scoped React context. Replace `pending: boolean` with `state: "idle" | "submitting" | "loading"` on `useAction`. Remove `ActionObjectOptions` serialization from `submit`.

**Status:** committed
**Blocked by:** 2, 3, 4
**Not this task:** Barrel export updates (Task 6)

**Done when:**
- **Multi-provider:**
  - Module-level `_factory`, `_emitEvent`, `_mountCount` variables replaced by a `_globalRegistry` (`Map<string, ActionDefinition>`)
  - Each `ActionsProvider` registers its action types into `_globalRegistry` on mount and removes them on unmount
  - `resolveFormData` (module-level export) reads from `_globalRegistry` instead of `_factory`
  - Duplicate action type across two mounted providers throws on mount
  - `useAction` reads from the nearest `ActionsProvider` via scoped React context (not the global registry)
  - `debug` and `onAction` scoped to their own provider subtree
- **State alignment:**
  - `UseActionState.pending` replaced by `state: "idle" | "submitting" | "loading"`, mapped directly from `fetcher.state`
  - Implements the `UseActionState` and `useAction` contracts from the spec (Module 6)
- **Options removal:**
  - `submit` function inside `useAction` no longer accepts or serializes `ActionObjectOptions`
- **Tests (`src/__tests__/adapter.test.tsx`):**
  - Existing tests updated: `pending` assertions changed to `state` assertions
  - New test: two `ActionsProvider`s with disjoint action sets — both resolve via `resolveFormData`
  - New test: two `ActionsProvider`s with overlapping action type — throws on mount
  - New test: unmounting a provider cleans up its types from the global registry
  - Existing integration tests (submit → action → response, onSuccess, onError) still pass
- All tests pass

---

### 6. Update barrel exports and delete dead code (AFK)
Update `index.ts` to export the new names and remove deleted exports. Delete the old `with-message-overrides.ts` file if not already removed.

**Status:** committed
**Blocked by:** 1, 2, 3, 4, 5
**Not this task:** README rewrite (out of scope per spec), consumer app migration (out of scope per spec)

**Done when:**
- `index.ts` exports `withMetaOverrides` (not `withMessageOverrides`)
- `index.ts` no longer exports `MessageFactory`, `ActionObjectOptions`
- `index.ts` exports `ActionCreator` with 5 generic params (including `TMeta`)
- No dead imports or unused type exports remain
- `yarn typecheck` passes across the entire package
- `yarn test` passes (full suite)
- `yarn build` produces clean output (no build errors)
