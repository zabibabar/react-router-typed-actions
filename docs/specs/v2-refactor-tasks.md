# react-router-actions v2 — Tasks

> Spec: [react-router-actions v2](./v2-refactor.md)
> **Feature status:** committed

### 1. `withMessageOverrides` module (AFK)
New standalone module with symbol-based message override tagging, replacing the duck-typed `isDynamicResult`.

**Status:** committed
**Blocked by:** None — can start immediately
**Not this task:** Factory integration (Task 3), barrel exports (Task 5)

**Done when:**
- Implements the `withMessageOverrides`, `isMessageOverride`, `MessageOverrideResult`, and `MessageOverrides` contracts from the spec
- Symbol-based detection correctly distinguishes tagged results from plain objects that happen to have `data` + `successMessage` fields
- Tests cover: tagging, detection, null data, empty overrides, false positives on duck-typed objects
- Existing code is not modified — this is a new module added alongside current code

---

### 2. Core types + `defineAction` refactor (AFK)
Refactor `defineAction` to return a callable `ActionCreator`, apply optional field defaults, remove eliminated exports.

**Status:** committed
**Blocked by:** 1
**Not this task:** Factory internals (Task 3), adapter/hook changes (Task 4), barrel exports (Task 5)

**Done when:**
- `defineAction` returns an `ActionCreator` matching the spec contract — callable with payload to produce an `ActionObject`, with definition properties (`.type`, `.name`, `.method`) accessible on the creator
- `method` defaults to `"post"`, `name` defaults to `type`, `successMessage`/`errorMessage` default to `undefined`
- `ActionObject` interface uses conditional `resolve` signature based on `TContext` (no-arg for void, required arg otherwise)
- `ActionResult` type exported from factory module
- `buildActionModule`, `ValidateActionKeys`, `ActionRegistry`, `InferPayloadMap`, `InferActionMap`, `InferActions`, `SchemaLike` are removed
- Tests cover: callable creator produces correct ActionObject, defaults applied, definition properties accessible, conditional resolve typing

---

### 3. Factory refactor (AFK)
Update the internal factory to accept a flat array of definitions, integrate `withMessageOverrides` detection, and remove schema validation.

**Status:** committed
**Blocked by:** 1, 2
**Not this task:** Adapter/hook changes (Task 4), barrel exports (Task 5)

**Done when:**
- `createActionsFactory` accepts `ActionDefinition[]` and builds lookup map by `type`
- `buildActionObject` uses `isMessageOverride` (symbol guard) instead of duck-typed `isDynamicResult`
- Schema validation code removed from `resolveFormData`
- `ActionObject.resolve` uses conditional `TContext` signature
- `ActionObject` includes `name` field
- Round-trip tests updated: `createFormData`/`resolveFormData` with new definition shape, `withMessageOverrides` round-trip through resolve, optional messages (undefined when omitted)
- Existing factory tests that reference `buildActionModule` or `schema` are updated or removed

---

### 4. Adapter refactor (AFK)
Refactor `ActionsProvider` to accept a flat array and `useAction` to accept an `ActionCreator` with tuple return and lifecycle callbacks.

**Status:** committed
**Blocked by:** 2, 3
**Not this task:** Barrel exports (Task 5), README (Task 6)

**Done when:**
- `ActionsProvider` accepts `ActionCreator[]` (or `ActionDefinition[]`), builds factory internally, keys derived from `type`
- `useAction` accepts an `ActionCreator`, returns `[submitFn, state]` tuple matching the spec contract
- `onSuccess` fires with unwrapped `TResult` on success, `onError` fires with error on failure — each fires exactly once per settlement via ref-tracked `useEffect`
- `pendingPayload` deserialized from `fetcher.formData`
- Strict mode double-mount warning uses `_mountCount > 2` threshold
- All `ActionRegistry`-based derived types (`RegisteredActionType`, `RegisteredPayload`, `RegisteredResolveReturn`) removed
- Module-level `resolveFormData` unchanged (reads singleton)
- Adapter tests updated: tuple return shape, `onSuccess`/`onError` fire correctly, throws outside provider

---

### 5. Barrel exports + cleanup (AFK)
Update `index.ts` to reflect the final public API surface and remove dead code.

**Status:** committed
**Blocked by:** 1, 2, 3, 4
**Not this task:** README (Task 6)

**Done when:**
- `index.ts` exports exactly the runtime functions and types listed in the spec's Public API surface table
- No dead exports remain (`buildActionModule`, `createActionsFactory`, `ActionRegistry`, `SchemaLike`, `createAction`, `InferPayloadMap`, `InferActionMap`, `InferActions`)
- `yarn typecheck` passes
- `yarn test` passes (all updated tests green)
- `schema-validation.test.ts` removed

---

### 6. README + documentation (AFK)
Rewrite the README to reflect the v2 API with usage examples and handler/toast recipes.

**Status:** committed
**Blocked by:** 1, 2, 3, 4, 5
**Not this task:** Implementation code changes

**Done when:**
- Quick-start shows minimal `defineAction` (two required fields), `ActionsProvider`, and `useAction` tuple
- TanStack Query recipe shows calling the action creator directly (`createCampaign(payload)`)
- Handler recipe shows user-written `handleAction` with `resolveFormData` and `ActionResult` return type
- Toast recipe shows `onSuccess`/`onError` wired to a toast library (simplified, no `useEffect`)
- `withMessageOverrides` usage documented
- Optional fields (`method`, `name`, `successMessage`, `errorMessage`) documented with defaults
- Server action compatibility section included
- No references to removed concepts (`BaseClientAction`, `buildActionModule`, `ActionRegistry`, `declare module`, `createAction`, `schema`)
