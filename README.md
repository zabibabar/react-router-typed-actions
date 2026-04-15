# react-router-actions

A type-safe action system for handling client-side form submissions and API calls in React Router.

## Why?

React Router's `clientAction` receives a `Request` with `FormData` — it has no built-in way to dispatch typed actions with payloads, structured error handling, or toast notifications. This library bridges that gap:

1. **Type-safe dispatch** — `ActionsFactory.createFormData("createItem", payload)` validates the payload at compile time
2. **Structured round-trip** — Actions serialize to `FormData` for React Router, then deserialize back into typed class instances in the handler
3. **Consistent UX** — Every action gets success/error toasts, loading states, and message overrides without per-route boilerplate
4. **Type-safe results** — `ActionHandlerReturn` narrows `result.response` based on `result.type`, so you get full autocomplete after a type check

## Install

```bash
npm install react-router-actions
```

> `react-router >= 7.0.0` is a peer dependency.

## Quick Start

### 1. Define action classes

```typescript
// actions/item-actions.ts
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

  resolve(token: string) {
    return fetch("/api/items", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(this.payload),
    }).then((r) => r.json());
  }
}

export const actionConstructorMap = buildActionModule({
  createItem: CreateItemAction,
});
```

Keys **must** match each action's `type` property — this is enforced at compile time.

### 2. Create the factory

```typescript
// actions/index.ts
import {
  createActionsFactory,
  createActionHandler,
  type InferActions,
  type InferClassMap,
} from "react-router-actions";
import * as ItemActions from "./item-actions";

const allActionConstructors = {
  ...ItemActions.actionConstructorMap,
  // ...spread more domain modules here
};

export const { ActionsFactory, createAction } = createActionsFactory(allActionConstructors);

export type RootAction = InferActions<typeof allActionConstructors>;
export type RootActionClassMap = InferClassMap<typeof allActionConstructors>;
```

### 3. Wire up the handler

```typescript
// actions/handler.ts
import { createActionHandler } from "react-router-actions";
import { ActionsFactory, createAction } from "./index";
import { auth } from "../auth";
import { toast } from "../toast";

export const handleAction = createActionHandler(
  { ActionsFactory, createAction },
  {
    getToken: () => auth.getTokenSilently(),
    onSuccess: (msg) => toast.success(msg),
    onError: (msg) => toast.error(msg),
    onLoading: (promise, messages) =>
      toast.promise(promise, {
        loading: messages.loading,
        success: messages.success,
        error: messages.error,
      }),
    extractError: (err) => (err instanceof Error ? err.message : String(err)),
  },
);
```

### 4. Use in a route

```typescript
// routes/items.tsx
import type { ClientActionFunctionArgs } from "react-router";
import { handleAction } from "../actions/handler";
import { ActionsFactory } from "../actions";

// Route action — one line
export async function clientAction(args: ClientActionFunctionArgs) {
  return handleAction(args);
}

// Component — type-safe dispatch
function ItemForm() {
  const fetcher = useFetcher();

  const handleSubmit = () => {
    const { formData, method } = ActionsFactory.createFormData("createItem", {
      title: "New Widget",
    });
    fetcher.submit(formData, { method });
  };

  return <button onClick={handleSubmit}>Create</button>;
}
```

### 5. Read the result (type-safe)

```typescript
const fetcher = useFetcher<ActionHandlerReturn<typeof allActionConstructors>>();

useEffect(() => {
  if (fetcher.data?.type === "createItem" && fetcher.data.success) {
    // fetcher.data.response is fully typed here
    navigate(`/items/${fetcher.data.response.id}`);
  }
}, [fetcher.data]);
```

## Options

```typescript
// Loading toast for long-running operations
ActionsFactory.createFormData("importData", payload, {
  showLoadingToast: true,
  loadingMessage: "Importing...",
});

// Override messages
ActionsFactory.createFormData("createItem", payload, {
  successMessageOverride: "Done!",
  errorMessageOverride: "Something went wrong.",
});
```

## Advanced: Stateful Actions

For actions that compute error messages during `resolve()` (e.g. partial failures in bulk operations), use instance state:

```typescript
class BulkCreateAction extends BaseClientAction<BulkPayload> {
  private failedIds: string[] = [];

  protected get defaultErrorMessage() {
    return `Failed to create ${this.failedIds.length} out of ${this.payload.total} items`;
  }

  async resolve(token: string) {
    const results = await Promise.allSettled(
      this.payload.items.map((item) => createItem(item, token)),
    );
    this.failedIds = results
      .map((r, i) => (r.status === "rejected" ? this.payload.items[i].id : null))
      .filter(Boolean) as string[];
    if (this.failedIds.length > 0) throw new Error("Some items failed");
    return { created: this.payload.items.length };
  }
}
```

The `defaultErrorMessage` getter is called _after_ `resolve()` throws, so `this.failedIds` is populated.

## API Reference

| Export | Description |
| --- | --- |
| `BaseClientAction<T>` | Abstract class — extend this to define an action |
| `BaseClientActionOptions` | Options type (message overrides, loading toast) |
| `buildActionModule(map)` | Validates and returns a constructor map (compile-time key↔type check) |
| `createActionsFactory(map)` | Returns `{ ActionsFactory, createAction }` bound to your constructor map |
| `createActionHandler(factory, deps)` | Returns a `handleAction` function with injected auth/toast/error deps |
| `ActionHandlerReturn<T>` | Discriminated union result type for handler returns |
| `InferActions<T>` | Extracts the union of action instances from a constructor map |
| `InferPayloadMap<T>` | Extracts `{ [type]: payload }` from a constructor map |
| `InferClassMap<T>` | Extracts `{ [type]: instance }` from a constructor map |

## License

ISC
