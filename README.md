# react-router-actions

Type-safe mutations for React Router. Define actions as plain objects, serialize payloads through `FormData` with full type fidelity, and get a typed `useAction` hook that handles pending state, optimistic UI, and error envelopes — with zero per-route boilerplate.

## The Problem

React Router's `useFetcher` takes untyped `FormData`. Every mutation means hand-rolling `formData.append`, parsing it back in the route `action`, and hoping the payload shape matches on both sides. Across 5, 10, 20+ mutations the pain compounds: inconsistent patterns, no compile-time safety, and tedious FormData plumbing on every route.

`react-router-actions` eliminates this entire category of work. You define each mutation once, register them in a module, and the library handles serialization (including Date, File, Map, Set, BigInt), type inference, and the `useFetcher` wrapper.

> **Positioning:** This library pays for itself in apps with **5+ mutation types across multiple routes**. For a single form on a single route, React Router's built-in `action` is simpler.

## Install

```bash
npm install react-router-actions
```

> Peer dependencies: `react >= 18.0.0`, `react-router >= 7.0.0`.

## Quick Start

### 1. Define actions

Each domain defines its mutations with `defineAction`:

```typescript
// domain/item/actions.ts
import { defineAction, buildActionModule } from "react-router-actions";

export const createItem = defineAction({
  type: "createItem",
  method: "post",
  resolve: (payload: { title: string }) =>
    fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => r.json()),
  successMessage: (p) => `"${p.title}" created`,
  errorMessage: "Failed to create item",
});

export const deleteItem = defineAction({
  type: "deleteItem",
  method: "delete",
  resolve: (payload: { id: string }) =>
    fetch(`/api/items/${payload.id}`, { method: "DELETE" }),
  successMessage: "Item deleted",
  errorMessage: (p) => `Failed to delete item ${p.id}`,
});

export const itemActions = buildActionModule({ createItem, deleteItem });
```

Keys **must** match each action's `type` — enforced at compile time by `buildActionModule`.

### 2. Register and augment types

Merge domain modules and augment `ActionRegistry` for global type safety:

```typescript
// app/actions.ts
import { type InferActionMap } from "react-router-actions";
import { itemActions } from "~/domain/item/actions";
import { orderActions } from "~/domain/order/actions";

export const allActions = { ...itemActions, ...orderActions };

declare module "react-router-actions" {
  interface ActionRegistry extends InferActionMap<typeof allActions> {}
}
```

### 3. Mount the Provider

```tsx
// root.tsx
import { ActionsProvider } from "react-router-actions";
import { allActions } from "~/actions";

export default function Root() {
  return (
    <ActionsProvider actions={allActions}>
      <Outlet />
    </ActionsProvider>
  );
}
```

### 4. Write the route handler

Each route's `clientAction` deserializes and executes the action. You own this function — wire in auth, toasts, error extraction, whatever your app needs:

```typescript
// routes/items.tsx
import { resolveFormData } from "react-router-actions";

export async function clientAction({ request }: Route.ClientActionArgs) {
  const formData = await request.formData();
  const action = resolveFormData(formData);

  try {
    const response = await action.resolve(undefined);
    return { type: action.type, success: true as const, response };
  } catch (error) {
    return { type: action.type, success: false as const, error };
  }
}
```

### 5. Use in features

`useAction` is fully typed — payload, pending state, result, and optimistic data:

```tsx
import { useAction } from "react-router-actions";

function CreateItemButton() {
  const { submit, isPending } = useAction("createItem");

  return (
    <button onClick={() => submit({ title: "Widget" })} disabled={isPending}>
      {isPending ? "Creating..." : "Create"}
    </button>
  );
}
```

That's it. Install to working mutation in under 2 minutes.

## Handler Recipe

The route `clientAction` is yours to customize. Here's a production-ready recipe with auth injection, toast callbacks, and error extraction:

```typescript
// lib/action-handler.ts
import { resolveFormData, type ActionObject } from "react-router-actions";
import { auth } from "~/auth";
import { toast } from "~/toast";

export async function handleAction({ request }: { request: Request }) {
  const formData = await request.formData();
  const action = resolveFormData(formData);

  try {
    const token = await auth.getTokenSilently();
    const response = await action.resolve(token);

    // successMessage can be a lazy () => string for dynamic messages
    toast.success(action.successMessage);
    return { type: action.type, success: true as const, response };
  } catch (err) {
    toast.error(action.errorMessage);
    const error = err instanceof Error ? err.message : String(err);
    return { type: action.type, success: false as const, error };
  }
}
```

Then every route is a one-liner:

```typescript
import { handleAction } from "~/lib/action-handler";

export async function clientAction(args: Route.ClientActionArgs) {
  return handleAction(args);
}
```

### Dynamic messages from `resolve`

When `resolve` returns `{ data, successMessage?, errorMessage? }` instead of raw data, the action object's message accessors return the overrides:

```typescript
const uploadFile = defineAction({
  type: "uploadFile",
  method: "post",
  resolve: async (payload: { file: File }) => {
    const result = await upload(payload.file);
    return {
      data: result,
      successMessage: `Uploaded "${payload.file.name}" (${result.size} bytes)`,
    };
  },
  successMessage: "File uploaded",
  errorMessage: "Upload failed",
});
```

After `action.resolve()` completes, `action.successMessage` returns the dynamic override. Options passed at submit time (`successMessageOverride`) still take highest precedence.

### Message precedence

1. `options.successMessageOverride` / `options.errorMessageOverride` (highest)
2. Dynamic override from `resolve` return value
3. Static string or `(payload) => string` from `defineAction`

## Optimistic UI

```tsx
const { submit, pendingPayload } = useAction("deleteItem");
const pendingId = pendingPayload?.id ?? null;

const visible = pendingId
  ? items.filter((item) => item.id !== pendingId)
  : items;
```

`pendingPayload` is derived from `fetcher.formData` and auto-clears on settle. On error, the row reappears automatically.

## Auth and Context

The `TContext` generic controls what `resolve` receives as its second argument. It defaults to `void`.

```typescript
// No context needed
const simple = defineAction({
  type: "simple",
  method: "post",
  resolve: (payload: { name: string }) => doSomething(payload.name),
  successMessage: "Done",
  errorMessage: "Failed",
});

// Token-based auth
const authed = defineAction({
  type: "authed",
  method: "post",
  resolve: (payload: { id: string }, token: string) =>
    fetch("/api/items", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  successMessage: "Done",
  errorMessage: "Failed",
});

// Rich context object
const rich = defineAction({
  type: "rich",
  method: "post",
  resolve: (payload: Payload, ctx: { token: string; userId: string }) => {
    // Full context available
  },
  successMessage: "Done",
  errorMessage: "Failed",
});
```

Use `buildActionModule<TContext>()` to enforce that all actions in a module share the same context type:

```typescript
const secureActions = buildActionModule<string>({ authed });
```

## Schema Validation

`defineAction` accepts an optional `schema` field — any object with a `.parse(data)` method (Zod, Valibot, or a custom validator). The schema is checked during `resolveFormData`, at the deserialization boundary:

```typescript
import { z } from "zod";

const createItem = defineAction({
  type: "createItem",
  method: "post",
  schema: z.object({ title: z.string().min(1), priority: z.number() }),
  resolve: (payload) => api.createItem(payload),
  successMessage: "Created",
  errorMessage: "Failed",
});
```

Invalid payloads throw a descriptive error including the action type and validation details. Actions without a schema skip validation entirely.

## Serialization

Payloads are serialized with [SuperJSON](https://github.com/blitz-js/superjson) (~2KB), preserving types that `JSON.stringify` drops: **Date**, **Map**, **Set**, **BigInt**, **undefined**, **RegExp**, **NaN**, **Infinity**.

`File` and `Blob` values are extracted from the payload tree and appended as native `FormData` entries, so they travel over the wire without base64 encoding. On deserialization, they're reinserted at their original paths.

## Server Actions

The same action definitions work in React Router server `action` exports. The core (`defineAction`, `buildActionModule`, `createActionsFactory`) has zero React dependencies:

```typescript
// routes/items.server.ts (server action)
import { createActionsFactory } from "react-router-actions";
import { itemActions } from "~/domain/item/actions";

const factory = createActionsFactory(itemActions);

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const action = factory.resolveFormData(formData);
  const result = await action.resolve(getServerContext());
  return { type: action.type, success: true, response: result };
}
```

## TanStack Query

`createAction` instantiates an action directly — use it inside `useMutation` or any non-fetcher context:

```typescript
import { createAction } from "react-router-actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";

function useCreateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { title: string }) => {
      const action = createAction("createItem", payload);
      return action.resolve(undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}
```

## API Reference

### Functions

| Export | Description |
| --- | --- |
| `defineAction(config)` | Create a typed action definition from a plain object config |
| `buildActionModule(defs)` | Group action definitions per domain; compile-time key validation |
| `createActionsFactory(modules)` | Create a factory from merged modules — returns `{ createFormData, resolveFormData, createAction }` |
| `ActionsProvider` | React component — sets the module singleton and provides context |
| `useAction(type, options?)` | Typed hook wrapping `useFetcher` — returns `submit`, `isPending`, `data`, `error`, `pendingPayload` |
| `resolveFormData(formData)` | Deserialize FormData into an action object (reads from singleton) |
| `createAction(type, payload, options?)` | Instantiate an action by type (reads from singleton) |

### Types

| Export | Description |
| --- | --- |
| `ActionRegistry` | Module augmentation interface for global type safety |
| `ActionDefinition<TType, TPayload, TResult, TContext>` | Shape of an action definition object |
| `ActionDefinitionRecord<TContext>` | Constraint type for maps of action definitions |
| `ActionMethod` | `"get" \| "post" \| "put" \| "patch" \| "delete"` |
| `ActionOptions` | Options type (`successMessageOverride`, `errorMessageOverride`) |
| `ActionObject` | Runtime action instance with `resolve`, `payload`, messages |
| `ActionResult<K>` | Discriminated union: `{ success: true, response } \| { success: false, error }` |
| `UseActionReturn<K>` | Return type of `useAction` |
| `ActionsProviderProps` | Props for `ActionsProvider` |
| `MessageFactory<TPayload>` | `string \| ((payload: TPayload) => string)` |
| `SchemaLike<T>` | `{ parse(data: unknown): T }` — compatible with Zod, Valibot, etc. |
| `InferPayloadMap<T>` | Extract `{ [type]: payload }` map from a module |
| `InferActionMap<T>` | Extract `{ [type]: ActionDefinition }` map — use for `ActionRegistry` augmentation |
| `InferActions<T>` | Union of all action definitions in a module |

## License

ISC
