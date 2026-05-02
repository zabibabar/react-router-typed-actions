# react-router-actions v2 Refactor

## Problem Statement

React Router applications that perform client-side mutations through `useFetcher` face four recurring pain points: (1) mutation logic is locked to individual routes and cannot be reused across multiple routes, (2) `fetcher.submit` accepts untyped `FormData` with no compile-time safety from payload to handler to response, (3) teams have no enforced structure for how mutations are defined, leading to inconsistent patterns across the codebase, and (4) constructing `FormData` manually for every mutation is tedious and error-prone.

The existing v1 of `react-router-actions` solves these problems but has design limitations that hinder adoption: a class-based API (`extends BaseClientAction`) that is polarizing in the React ecosystem, `JSON.stringify` serialization that loses type fidelity for Date/File/Blob/Map/Set, an opinionated action handler baked into the package that couples toast and auth concerns, and an `onLoading` callback that reads messages eagerly (before `resolve` completes) breaking dynamic message patterns used in production.

## Solution

Refactor `react-router-actions` into a v2 with a functional `defineAction()` API, SuperJSON-based serialization with File/Blob hybrid support, and a leaner public API surface that removes the action handler (documenting it as a user-written recipe instead). The core becomes framework-agnostic so the same action definitions work with React Router `clientAction`, server `action`, TanStack Query, or plain function calls.

## Implementation Decisions

### Module architecture — Core + React Router Adapter

The package is structured internally as two layers shipped from a single entry point:

**Core (zero React/React Router dependencies):**
- **Action Definition** — `defineAction()` accepts a plain object config (type, method, resolve, successMessage, errorMessage) and returns a typed action definition. Replaces `BaseClientAction` class. The `resolve` function receives `(payload, context)` and may return either raw data or `{ data, successMessage?, errorMessage? }` for dynamic messages.
- **Action Module** — `buildActionModule<TContext>()` groups action definitions per domain and validates at compile time that each map key matches the action's `type` literal.
- **Serialization** — Default serializer uses SuperJSON for type-safe encoding (Date, Map, Set, BigInt, undefined, RegExp, NaN, Infinity). File/Blob values are extracted from the payload tree, replaced with sentinel markers, and appended as separate native FormData entries. The deserializer reverses this process. The serializer is internal to the factory (not user-facing in v2; pluggable serializer is a future consideration).
- **Action Factory** — `createActionsFactory()` merges domain modules into a single registry. Exposes `createFormData(type, payload, options?)` for serialization and `resolveFormData(formData)` for deserialization. Uses the serialization module internally.
- **createAction** — `createAction(type, payload, options?)` instantiates an action object (plain object with `resolve`, `successMessage`, `errorMessage`, `payload`, `type`, `method`) from the registry. Used by TanStack Query mutations, tests, and any non-fetcher context.
- **Type Utilities** — `InferPayloadMap`, `InferActionMap`, `InferActions` extract type maps from the registry. `ActionRegistry` is an empty interface for module augmentation.

**React Router Adapter (depends on React and React Router):**
- **ActionsProvider** — Sets a module-level singleton (justified by React Router's route module import constraint that prevents routes from importing the aggregation file) and a React context. Accepts `actions` (the merged registry) as a prop.
- **useAction Hook** — Typed wrapper around `useFetcher`. Returns `{ submit, isPending, data, error, pendingPayload }`. Reads from the React context set by `ActionsProvider`.

### Removed from public API

- `createActionHandler` and `handleAction` are removed. The README documents a handler recipe covering auth context injection, toast callbacks (including lazy `() => string` for dynamic messages), and error extraction. This eliminates coupling between the package and app-specific concerns (auth providers, toast libraries, error shapes).
- `BaseClientAction` class is replaced by `defineAction()`. No class inheritance in v2.

### Module singleton

The module-level `_registry` singleton is retained. React Router's route module convention prevents routes from importing `app/actions.ts` (the aggregation file), so the singleton is the only mechanism for `resolveFormData` in route `clientAction` exports to access the registry without a direct import. The provider sets it; routes read it. A clear error message is thrown if accessed before the provider mounts. DEV-mode warning is emitted if `ActionsProvider` mounts twice.

### Module augmentation

The `ActionRegistry` augmentation pattern is retained for the same import-constraint reason. Users write `declare module "react-router-actions" { interface ActionRegistry extends InferActionMap<typeof registry> {} }` once in their aggregation file. This provides global type safety for `useAction` and `createAction` without runtime import cycles.

### TContext generic

`TContext` is kept as a registry-level generic parameter. It enforces that every action in the registry has the same `resolve(payload, context: TContext)` signature, which is essential for any generic handler to call `action.resolve(context)` without narrowing on action type. Defaults to `void` for apps that don't need injected context.

### Serialization strategy

SuperJSON is the default serializer, replacing raw `JSON.stringify`. For File/Blob support, the serializer walks the payload tree during `createFormData`:
- Non-File/Blob values are encoded via `superjson.stringify` into a single `"payload"` FormData field.
- File/Blob values are extracted, replaced with sentinel objects (`{ __file: "<dotpath>" }`), and appended as separate native FormData entries keyed `file:<dotpath>`.
- `resolveFormData` reverses: parses the `"payload"` field with `superjson.parse`, walks `file:*` FormData entries, and reinserts them at their original paths.

SuperJSON is a production-grade dependency (~2KB, used by tRPC) and handles Date, Map, Set, BigInt, undefined, RegExp, NaN, Infinity, -0.

### Action result shape for dynamic messages

`resolve` may return either raw data or `{ data, successMessage?, errorMessage? }`. The action object's `successMessage`/`errorMessage` accessors check if resolve returned overrides and prefer them over the static defaults. This replaces the v1 class pattern of mutating instance fields inside `resolve()` and reading them from a getter.

### Optional schema validation (future-ready)

`defineAction` accepts an optional `schema` field (Zod, Valibot, or any object with a `.parse()` method). When present, `resolveFormData` validates the deserialized payload against the schema before constructing the action object. Invalid payloads throw a descriptive error. This is additive — actions without a schema skip validation.

### Design Rationale

- **Composition over Inheritance**: `defineAction()` replaces class hierarchy with plain object composition. No `extends`, no `this`, no `abstract` — just a config object and pure functions. Lowers adoption friction in the React ecosystem.
- **Factory Pattern**: `createActionsFactory()` encapsulates the construction of action instances and FormData from type+payload, hiding serialization details from consumers.
- **Facade Pattern**: `useAction` simplifies `useFetcher` + factory + serialization + pending state derivation into a single hook call.
- **SRP**: Serialization is separated from the factory because they change for different reasons (format changes vs. FormData field naming changes). The handler is removed from the package because auth/toast/error concerns change independently of the action registry.
- **ISP**: The React Router adapter only exposes what React Router consumers need (provider + hook). Core consumers (TanStack Query, tests, server actions) use `createAction`/`createActionsFactory` without pulling in React dependencies.
- **OCP**: The optional `schema` field makes validation extensible without modifying the core defineAction shape. The serialization module can accept a custom serializer in the future without changing the factory API.

## Testing Decisions

Tests should verify external behavior (the contract each module exposes), not implementation details. A good test for this package can be described in one sentence: "given this input, the module produces this output" or "given this misuse, the module throws this error."

### Modules under test

- **Action Definition** — `defineAction` returns an object with the correct shape; type/method/messages are accessible; resolve is callable.
- **Serialization** — Round-trip tests for every supported type: Date, Map, Set, BigInt, undefined, RegExp, nested objects, arrays, null. File/Blob extraction and reinsertion. Edge cases: empty payload, deeply nested Files, mixed File + Date payloads.
- **Action Factory** — `createFormData`/`resolveFormData` round-trip for various payloads. Invalid action type throws. Missing `actionType`/`payload` fields throw. Options serialization round-trip.
- **Action Module** — Compile-time type tests (using `tsd` or `expect-type`) that verify key-must-match-type validation catches mismatches. Runtime pass-through behavior.
- **createAction** — Correct instance shape for valid type. Throws for unknown type. Options are forwarded.
- **useAction** — Integration tests using React Router's `createMemoryRouter` or `createRoutesStub`: submit dispatches FormData to the route's `clientAction`, `isPending` reflects fetcher state, `data` contains the result envelope, `pendingPayload` is derived correctly, error path works. Throws outside `ActionsProvider`.
- **Dynamic messages** — After resolve returns `{ data, successMessage }`, the action object's `successMessage` accessor returns the override.

### Prior art

The existing `src/__tests__/index.test.ts` in v1 covers factory round-trips, handler success/error paths, and base action behavior. v2 tests follow the same structure but expand to cover serialization types and remove handler tests (handler is no longer in the package).

## Out of Scope

- **Server-side action handler implementation** — The package documents server action compatibility but does not ship a server-specific handler. Users write their own.
- **Toast/notification integration** — No toast library dependency or callback system. Users wire their handler to their toast library.
- **Form validation UI** — Conform-style form field binding is not in scope. Schema validation is at the deserialization boundary only.
- **CLI scaffolding** — A `create-react-router-actions` CLI or code generator is a future consideration.
- **Pluggable serializer API** — v2 ships SuperJSON as the only serializer. A pluggable interface is a future consideration.
- **Migration tooling** — The package is not yet published; no migration guide is needed.

## Further Notes

The package name `react-router-actions` is retained despite the core being framework-agnostic. React Router is the primary audience. If demand emerges for standalone or multi-framework use, the core can be published separately (e.g., `typed-actions`) without breaking the React Router package — the internal separation already supports this.

SuperJSON becomes a runtime dependency (not a peer dep). At ~2KB gzipped with zero transitive dependencies, it is an acceptable addition to the bundle.

The `brand-cmp-ui` codebase at LTK serves as the primary real-world validation of these patterns. It has 20+ action types across 7 domain modules, exercising dynamic messages, TanStack Query integration, File-less and File-based mutations, and both fetcher and non-fetcher dispatch paths.
