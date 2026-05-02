# react-router-actions v2 Refactor — Tasks

> Spec: [react-router-actions v2 Refactor](./v2-refactor.md)
> **Feature status:** committed

### 1. defineAction + type utilities + buildActionModule (AFK)
Replace the class-based foundation with the functional `defineAction()` API, type inference utilities, and `buildActionModule()` with compile-time key validation.

**Status:** committed
**Blocked by:** None — foundation slice

**Done when:**
- `defineAction()` accepts a plain object config (type, method, resolve, successMessage, errorMessage) and returns a typed action definition object
- `successMessage`/`errorMessage` accept both `string` and `(payload) => string`
- `buildActionModule<TContext>()` validates at compile time that map keys match each action's `type` literal
- `InferPayloadMap`, `InferActionMap`, `InferActions` correctly extract types from an action module
- `ActionRegistry` empty interface exists for module augmentation
- `TContext` generic flows through from module to action resolve signature
- Unit tests pass for `defineAction` shape, `buildActionModule` key validation, type tests via `expect-type` or `tsd`

---

### 2. Serialization module — SuperJSON + File/Blob hybrid (AFK)
Build the serialization layer that replaces `JSON.stringify` with SuperJSON and supports File/Blob extraction via native FormData entries.

**Status:** committed
**Blocked by:** None — independent of slice 1

**Done when:**
- `serialize(payload)` produces a SuperJSON-encoded string and a list of extracted File/Blob entries with their dot-paths
- `deserialize(encoded, files)` reconstructs the original payload with Files reinserted at their original paths
- Round-trip tests pass for: Date, Map, Set, BigInt, undefined, RegExp, NaN, Infinity, null, nested objects, arrays
- Round-trip tests pass for: single File, single Blob, deeply nested File, mixed File + Date payload, multiple Files
- Edge cases tested: empty payload, payload with no Files, payload with only Files
- `superjson` is added as a runtime dependency in `package.json`

---

### 3. Action Factory + createAction + dynamic messages (AFK)
Rewrite the factory to work with `defineAction` output and the new serialization module. Implement `createAction` for non-fetcher contexts. Support `resolve` returning dynamic message overrides.

**Status:** committed
**Blocked by:** 1, 2

**Done when:**
- `createActionsFactory(mergedModules)` returns `{ createFormData, resolveFormData, createAction }`
- `createFormData(type, payload, options?)` serializes via the new serialization module and returns `{ formData, method }`
- `resolveFormData(formData)` deserializes and returns an action object with `resolve`, `type`, `method`, `payload`, `successMessage`, `errorMessage`
- `createAction(type, payload, options?)` returns the same action object shape without going through FormData
- When `resolve` returns `{ data, successMessage?, errorMessage? }`, the action object's message accessors return the overrides
- When `resolve` returns raw data, message accessors return the static defaults
- `successMessageOverride`/`errorMessageOverride` in options still take precedence over everything
- Unit tests pass: factory round-trips with various payload types, invalid type throws, missing fields throw, createAction shape, dynamic message override from resolve, options override precedence

---

### 4. React Router adapter — Provider + useAction + ActionRegistry (AFK)
Rewrite the provider and hook to work with the new factory. Wire the module singleton, React context, and module augmentation.

**Status:** committed
**Blocked by:** 3

**Done when:**
- `ActionsProvider` accepts `actions` prop (merged registry), memoizes the factory, sets the module singleton, and provides React context
- `useAction(type)` returns `{ submit, isPending, data, error, pendingPayload }` with full type safety from `ActionRegistry` augmentation
- `submit(payload)` builds FormData via factory and calls `fetcher.submit`
- `pendingPayload` is derived from `fetcher.formData` and auto-clears on settle
- `data` is typed as `{ type, success: true, response } | { type, success: false, error }`
- Throws with clear message if `useAction` is called outside `ActionsProvider`
- Throws with clear message if singleton is accessed before provider mounts
- DEV-mode `console.warn` if `ActionsProvider` mounts twice
- Integration tests pass using `createRoutesStub` or `createMemoryRouter`: submit → clientAction → response round-trip, pending state, error path, outside-provider throw

---

### 5. Optional schema validation on deserialization boundary (AFK)
Add optional `schema` field to `defineAction` that validates payloads during `resolveFormData`.

**Status:** committed
**Blocked by:** 1, 3

**Done when:**
- `defineAction` accepts an optional `schema` field (any object with `.parse(data)` method)
- `resolveFormData` validates the deserialized payload against the schema when present
- Invalid payloads throw a descriptive error with the action type and validation details
- Actions without a schema skip validation (no behavioral change)
- Unit tests pass: valid payload with Zod schema, invalid payload throws, no schema skips validation, custom `.parse()` object works

---

### 6. v1 cleanup — remove old artifacts, update exports (AFK)
Delete the class-based v1 modules and update the barrel export to the new API surface.

**Status:** committed
**Blocked by:** 1, 2, 3, 4

**Done when:**
- `BaseClientAction` class is deleted
- `createActionHandler` and `handleAction` are deleted
- `action-handler.ts` is deleted
- `base-action.ts` is deleted (or fully replaced)
- `index.ts` barrel exports only v2 API: `defineAction`, `buildActionModule`, `createActionsFactory`, `createAction`, `ActionsProvider`, `useAction`, type utilities, `ActionRegistry`
- No v1 symbols are reachable from the public API
- `tsup` build succeeds with the new entry point
- All existing tests are updated or replaced — no test references v1 classes or handler

---

### 7. Documentation — README, handler recipe (HITL)
Rewrite the README for v2, document the handler recipe, and server action compatibility.

**Status:** pending
**Blocked by:** 1, 2, 3, 4, 5, 6

**Done when:**
- README leads with the problem (untyped `fetcher.submit` pain), not the solution
- Zero-to-working quickstart gets a developer from install to a working mutation in under 2 minutes
- Handler recipe section shows auth injection, toast callbacks (including lazy `() => string` for dynamic messages), and error extraction
- Server Actions section demonstrates that the same action definitions work in server `action` exports
- TanStack Query section shows `createAction` with `useMutation`
- API reference table covers all public exports
- Honest positioning: "for apps with 5+ mutation types across multiple routes"
