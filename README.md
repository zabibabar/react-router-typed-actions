# react-router-typed-actions

[![CI](https://github.com/zabibabar/react-router-typed-actions/actions/workflows/ci.yml/badge.svg)](https://github.com/zabibabar/react-router-typed-actions/actions/workflows/ci.yml)
[![Publish](https://github.com/zabibabar/react-router-typed-actions/actions/workflows/publish.yml/badge.svg)](https://github.com/zabibabar/react-router-typed-actions/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/react-router-typed-actions)](https://www.npmjs.com/package/react-router-typed-actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Type-safe, serializable actions for React Router.

> **Note:** The `0.x` version does not mean this library is unstable or buggy — it is actively used in production. It signals that the API is open to community feedback before committing to a `1.0` contract. Issues, ideas, and pull requests are welcome.

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Install](#install)
- [Quick Start](#quick-start)
- [Recipes](#recipes)
- [Serialization](#serialization)
- [API Reference](#api-reference)
- [License](#license)

## The Problem

React Router's `useFetcher` takes untyped `FormData`. Every mutation means hand-rolling `formData.append`, parsing it back in the route `action`, and hoping the payload shape matches on both sides. Across 5, 10, 20+ mutations the pain compounds: inconsistent patterns, no compile-time safety, and tedious FormData plumbing on every route.

## The Solution

Define each mutation once with `defineAction`, register it, and let the library handle serialization and type inference. `useActionFetcher` wraps `useFetcher` with full type safety on payloads, responses, pending state, and lifecycle callbacks — no `useEffect` boilerplate, no manual FormData.

Works with both **client actions** and **server actions**.

## Install

```bash
npm install react-router-typed-actions
```

Peer dependencies: `react >= 18.0.0`, `react-router >= 7.0.0`.

Runtime requirements: `node >= 20.19.0`, `npm >= 10.0.0`.

## Quick Start

### 1. Define actions

```typescript
// domain/todo/actions.ts
import { defineAction } from "react-router-typed-actions";

export const createTodo = defineAction({
  type: "todo/create",
  resolve: (payload: { title: string; priority: number }) =>
    api.todos.create(payload),
});

export const deleteTodo = defineAction({
  type: "todo/delete",
  method: "DELETE",
  resolve: (payload: { id: string }) =>
    api.todos.delete(payload.id),
});
```

### 2. Register actions

```typescript
// app/actions.ts
import { registerActions } from "react-router-typed-actions";
import { createTodo, deleteTodo } from "~/domain/todo/actions";
import { addComment } from "~/domain/comment/actions";

registerActions([createTodo, deleteTodo, addComment]);
```

Import this module from your root route (or any entry point) so registration runs before the first action is dispatched.

### 3. Write the route handler

```typescript
// lib/handle-action.ts
import {
  resolveFormData,
  actionSuccess,
  actionFailure,
} from "react-router-typed-actions";

export async function handleAction({ request }: { request: Request }) {
  const formData = await request.formData();
  const action = resolveFormData(formData);

  try {
    const response = await action.resolve();
    return actionSuccess(action, response);
  } catch (error) {
    return actionFailure(action, error);
  }
}
```

Then every route is a one-liner:

```typescript
import { handleAction } from "~/lib/handle-action";

export async function clientAction(args: Route.ClientActionArgs) {
  return handleAction(args);
}
```

### 4. Use in components

```tsx
import { useActionFetcher } from "react-router-typed-actions";
import { createTodo } from "~/domain/todo/actions";

function CreateTodoButton() {
  const [submit, { state, data }] = useActionFetcher(createTodo, {
    onSuccess: (result) => navigate(`/todos/${result.id}`),
    onError: (error) => toast.error(String(error)),
  });

  return (
    <button
      onClick={() => submit({ title: "Buy groceries", priority: 3 })}
      disabled={state !== "idle"}
    >
      {state === "submitting" ? "Creating..." : "Create Todo"}
    </button>
  );
}
```

## Recipes

### Optimistic UI

`pendingPayload` is deserialized from `fetcher.formData` and auto-clears on settlement. On error, the removed item reappears automatically.

```tsx
const [submit, { pendingPayload }] = useActionFetcher(deleteTodo);
const pendingId = pendingPayload?.id ?? null;

const visible = pendingId
  ? items.filter((item) => item.id !== pendingId)
  : items;
```

### Success / Error Callbacks

Wire toasts inline — no `useEffect` needed:

```tsx
const [submit] = useActionFetcher(createTodo, {
  onSuccess: () => toast.success("Todo created!"),
  onError: (err) => toast.error(String(err)),
});
```

### Meta and Dynamic Overrides

Attach static metadata to an action via the `meta` field:

```typescript
interface ToastMeta {
  successMessage: string;
  errorMessage: string;
}

const createTodo = defineAction<
  "todo/create",
  { title: string },
  { id: string },
  void,
  ToastMeta
>({
  type: "todo/create",
  resolve: (payload) => api.todos.create(payload),
  meta: {
    successMessage: "Todo created",
    errorMessage: "Failed to create todo",
  },
});
```

Override meta dynamically from within `resolve` using `withMetaOverrides`:

```typescript
import { defineAction, withMetaOverrides } from "react-router-typed-actions";

const createTodo = defineAction<
  "todo/create",
  { title: string },
  { id: string },
  void,
  ToastMeta
>({
  type: "todo/create",
  resolve: async (payload) => {
    const result = await api.todos.create(payload);
    if (result.requiresReview) {
      return withMetaOverrides(result, {
        successMessage: `"${payload.title}" created — pending review`,
      });
    }
    return result;
  },
  meta: {
    successMessage: "Todo created",
    errorMessage: "Failed to create todo",
  },
});
```

Read meta in the handler for centralized toast logic:

```typescript
const response = await action.resolve(token);
toast.success(action.meta.successMessage);
return actionSuccess(action, response);
```

### Multiple Actions on a Single Route

Define as many actions as you need — the route handler resolves the correct one by type:

```typescript
registerActions([createTodo, deleteTodo, updateTodo]);
```

All share the same `clientAction` handler. No switch statement, no manual dispatch.

### File Uploads

`File` and `Blob` values are extracted from the payload and appended as native `FormData` entries — no base64 encoding:

```typescript
const uploadAvatar = defineAction({
  type: "user/uploadAvatar",
  resolve: (payload: { userId: string; avatar: File }) =>
    api.users.uploadAvatar(payload.userId, payload.avatar),
});
```

### Auth and Context

The `TContext` generic controls what `resolve` receives as its second argument:

```typescript
const authed = defineAction({
  type: "authed",
  resolve: (payload: { id: string }, token: string) =>
    api.fetch(payload.id, { token }),
});
```

The handler passes context when calling `action.resolve(context)`:

```typescript
const token = await auth.getTokenSilently();
const response = await action.resolve(token);
```

### Server Actions

The same action definitions work in React Router server `action` exports:

```typescript
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const action = resolveFormData(formData);
  const result = await action.resolve(getServerContext());
  return actionSuccess(action, result);
}
```

### TanStack Query

Call the action creator directly — it returns an `ActionObject` for use outside the fetcher path:

```typescript
import { createTodo } from "~/domain/todo/actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";

function useCreateTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { title: string; priority: number }) => {
      const action = createTodo(payload);
      return action.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
}
```

## Serialization

Payloads are serialized with [SuperJSON](https://github.com/blitz-js/superjson) (~2 KB), preserving types that `JSON.stringify` drops: **Date**, **Map**, **Set**, **BigInt**, **undefined**, **RegExp**, **NaN**, **Infinity**.

`File` and `Blob` values are extracted from the payload tree and appended as native `FormData` entries, so they travel over the wire without base64 encoding. On deserialization they are reinserted at their original paths.

## API Reference

### Functions

| Export | Description |
| --- | --- |
| `defineAction(config)` | Define a callable action creator from a config object |
| `registerActions(actions)` | Register an array of actions for lookup by type |
| `useActionFetcher(action, options?)` | Typed hook wrapping `useFetcher` — returns `[submit, state]` tuple |
| `resolveFormData(formData)` | Deserialize `FormData` into an `ActionObject` |
| `createFormData(creator, payload)` | Serialize an action creator + payload into `FormData` |
| `actionSuccess(action, response)` | Create a success `ActionResult` envelope |
| `actionFailure(action, error)` | Create a failure `ActionResult` envelope |
| `withMetaOverrides(data, overrides)` | Wrap a resolve return value with dynamic meta overrides |
| `isMetaOverride(value)` | Type guard — returns `true` if the value is a `MetaOverrideResult` |

### Types

| Export | Description |
| --- | --- |
| `Action<TType, TPayload, TResult, TContext, TMeta>` | Callable action creator with identity properties |
| `ActionDefinition` | Shape of an action definition (post-defaults) |
| `ActionMethod` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"` |
| `ActionObject` | Runtime action instance with `resolve`, `payload`, `meta` |
| `ActionResult` | Discriminated union: `{ success: true, response } \| { success: false, error }` |
| `ActionSuccess` | Success branch of `ActionResult` |
| `ActionFailure` | Failure branch of `ActionResult` |
| `ActionResultOf<T>` | Extract the resolved return type from an action creator |
| `MetaOverrideResult<T, TMeta>` | Tagged wrapper returned by `withMetaOverrides` |
| `UseActionFetcherOptions<TResult>` | Options: `fetcherOptions?`, `onSuccess?`, `onError?` |
| `UseActionFetcherState<...>` | State object: `state`, `data`, `pendingPayload` |

## License

MIT
