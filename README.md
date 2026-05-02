# react-router-actions

A type-safe action system for React Router. Define mutation classes, register them once, and get fully typed `useAction` hooks and route handlers — with zero per-route boilerplate.

## Why?

React Router's `clientAction` receives a raw `Request` with `FormData`. There's no built-in way to dispatch typed mutations with structured payloads, automatic error handling, or toast notifications. This library bridges that gap:

- **Type-safe dispatch** — `useAction("createItem")` validates the payload and return type at compile time
- **Structured round-trip** — Actions serialize to `FormData` for React Router, then deserialize back into typed class instances in the handler
- **Provider-based DI** — One `<ActionsProvider>` at the root; features import `useAction` directly from the library with no layer violations
- **Flexible context** — `TContext` generic lets you inject auth tokens, service clients, or nothing at all (`void` default)
- **Framework-friendly** — Works with React Router's automatic loader revalidation; also usable with TanStack Query via `createAction`

## Install

```bash
npm install react-router-actions
```

> Peer dependencies: `react >= 18.0.0` and `react-router >= 7.0.0`.

## Quick Start

### 1. Define action classes

Each domain defines its mutation classes by extending `BaseClientAction`:

```typescript
// domain/item/actions.ts
import { BaseClientAction, buildActionModule } from "react-router-actions";

interface CreateItemPayload {
  title: string;
}

class CreateItemAction extends BaseClientAction<CreateItemPayload> {
  readonly type = "createItem";
  readonly method = "POST";

  protected get defaultSuccessMessage() {
    return `Item "${this.payload.title}" created`;
  }

  protected get defaultErrorMessage() {
    return `Failed to create "${this.payload.title}"`;
  }

  resolve() {
    return fetch("/api/items", {
      method: "POST",
      body: JSON.stringify(this.payload),
    }).then((r) => r.json());
  }
}

export const itemActionModule = buildActionModule({
  createItem: CreateItemAction,
});
```

Keys **must** match each action's `type` property — this is enforced at compile time by `buildActionModule`.

### 2. Register actions and augment types

Merge all domain action modules into one registry and augment the `ActionRegistry` interface for global type safety:

```typescript
// app/actions.ts
import { type InferClassMap } from "react-router-actions";
import { itemActionModule } from "~/domain/item/actions";
import { orderActionModule } from "~/domain/order/actions";

export const appActionRegistry = {
  ...itemActionModule,
  ...orderActionModule,
};

declare module "react-router-actions" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ActionRegistry extends InferClassMap<typeof appActionRegistry> {}
}
```

### 3. Mount the Provider

Wrap your app with `<ActionsProvider>` in the root layout:

```tsx
// root.tsx
import { ActionsProvider } from "react-router-actions";
import { appActionRegistry } from "~/actions";

export default function Root() {
  return (
    <ActionsProvider actions={appActionRegistry}>
      <Outlet />
    </ActionsProvider>
  );
}
```

### 4. Use in routes

Every route's `clientAction` is a one-liner:

```typescript
// routes/items.tsx
import { handleAction } from "react-router-actions";

export async function clientAction(args: ClientActionFunctionArgs) {
  return handleAction(args);
}
```

### 5. Use in features

`useAction` is fully typed — payload, pending state, result, and optimistic data:

```tsx
import { useAction } from "react-router-actions";

function CreateItemButton() {
  const { submit, isPending, data, error } = useAction("createItem");

  return (
    <button
      onClick={() => submit({ title: "New Widget" })}
      disabled={isPending}
    >
      {isPending ? "Creating..." : "Create"}
    </button>
  );
}
```

### 6. Optimistic UI with `pendingPayload`

```tsx
const { submit, pendingPayload } = useAction("deleteItem");
const pendingId = pendingPayload?.id ?? null;

const visible = pendingId
  ? items.filter((item) => item.id !== pendingId)
  : items;
```

`pendingPayload` is derived from `fetcher.formData` and auto-clears on settle. On error, the row reappears automatically.

## Auth and Context

The `TContext` generic on `BaseClientAction` controls what `resolve()` receives. It defaults to `void` (no arguments).

### No auth needed

```typescript
class SimpleAction extends BaseClientAction<{ name: string }> {
  resolve() {
    // TContext defaults to void — no arguments
    return doSomething(this.payload.name);
  }
}
```

### Token-based auth

```typescript
class AuthedAction extends BaseClientAction<{ id: string }, string> {
  resolve(token: string) {
    return fetch("/api/items", {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}
```

Pass `getContext` in the Provider's handler config:

```tsx
<ActionsProvider
  actions={appActionRegistry}
  handler={{
    getContext: () => auth.getTokenSilently(),
  }}
>
```

### Rich context

```typescript
class RichAction extends BaseClientAction<Payload, { token: string; userId: string }> {
  resolve(ctx: { token: string; userId: string }) {
    // Full context object available
  }
}
```

## Toast / UX Callbacks

Wire toast notifications via the `handler` prop:

```tsx
<ActionsProvider
  actions={appActionRegistry}
  handler={{
    onSuccess: (msg) => toast.success(msg),
    onError: (msg) => toast.error(msg),
    onLoading: (promise, messages) =>
      toast.promise(promise, {
        loading: messages.loading,
        success: messages.success,
        error: messages.error,
      }),
    extractError: (err) => (err instanceof Error ? err.message : String(err)),
  }}
>
```

Per-action options override the defaults:

```typescript
const { submit } = useAction("importData", {
  showLoadingToast: true,
  loadingMessage: "Importing...",
  successMessageOverride: "All done!",
});
```

## Using with TanStack Query

`createAction` instantiates an action directly — use it inside `useMutation` or any non-Router context:

```typescript
import { createAction } from "react-router-actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";

function useCreateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { title: string }) => {
      const action = createAction("createItem", payload);
      return action.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}
```

## API Reference

### Classes and Functions

| Export | Description |
| --- | --- |
| `BaseClientAction<TPayload, TContext>` | Abstract base class for actions. `TContext` defaults to `void`. |
| `buildActionModule(map)` | Validates and returns a constructor map (compile-time key ↔ type check) |
| `ActionsProvider` | React component that registers actions and provides context |
| `useAction(type, options?)` | Typed hook wrapping `useFetcher` — returns `submit`, `isPending`, `data`, `error`, `pendingPayload` |
| `handleAction(args, options?)` | Route `clientAction` handler — reads from the Provider's registry |
| `createAction(type, payload, options?)` | Direct instantiation — for TanStack Query, tests, scripts |
| `createActionsFactory(map)` | Low-level factory creation (used internally by the Provider) |
| `createActionHandler(factory, deps)` | Low-level handler creation (used internally by the Provider) |

### Types

| Export | Description |
| --- | --- |
| `ActionRegistry` | Module augmentation interface for global type safety |
| `BaseClientActionOptions` | Options type (message overrides, loading toast) |
| `UseActionReturn<K>` | Return type of `useAction` |
| `UseActionOptions` | Options for `useAction` (extends `BaseClientActionOptions` + `action` URL) |
| `ActionsProviderProps<TContext>` | Props for `ActionsProvider` |
| `ActionHandlerReturn<T>` | Discriminated union result type |
| `ActionHandlerDependencies<TContext>` | Handler dependency config (getContext, toast callbacks) |
| `ActionConstructorRecord<TContext>` | Constraint type for constructor maps |
| `InferActions<T>` | Extracts union of action instances from a constructor map |
| `InferPayloadMap<T>` | Extracts `{ [type]: payload }` from a constructor map |
| `InferClassMap<T>` | Extracts `{ [type]: instance }` from a constructor map |

## License

ISC
