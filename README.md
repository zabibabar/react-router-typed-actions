# react-router-actions

Type-safe mutations for React Router. Define actions as plain objects, serialize payloads through `FormData` with full type fidelity, and dispatch them with a typed hook — pending state, optimistic UI, lifecycle callbacks, and error envelopes included. Zero per-route boilerplate.

## The Problem

React Router's `useFetcher` takes untyped `FormData`. Every mutation means hand-rolling `formData.append`, parsing it back in the route `action`, and hoping the payload shape matches on both sides. Across 5, 10, 20+ mutations the pain compounds: inconsistent patterns, no compile-time safety, and tedious FormData plumbing on every route.

`react-router-actions` eliminates this entire category of work. You define each mutation once, pass them to a provider, and the library handles serialization (including Date, File, Map, Set, BigInt), type inference, and the `useFetcher` wrapper — with `onSuccess`/`onError` callbacks that remove `useEffect` boilerplate.

> **Positioning:** This library pays for itself in apps with **5+ mutation types across multiple routes**. For a single form on a single route, React Router's built-in `action` is simpler.

## Install

```bash
npm install react-router-actions
```

> Peer dependencies: `react >= 18.0.0`, `react-router >= 7.0.0`.

## Quick Start

### 1. Define actions

Each domain defines its mutations with `defineAction`. Only `type` and `resolve` are required:

```typescript
// domain/campaign/actions.ts
import { defineAction } from "react-router-actions";

export const createCampaign = defineAction({
  type: "campaign/create",
  resolve: (payload: { name: string; budget: number }) =>
    api.campaigns.create(payload),
});

export const deleteCampaign = defineAction({
  type: "campaign/delete",
  method: "DELETE",
  resolve: (payload: { id: string }) =>
    api.campaigns.delete(payload.id),
});
```

Group actions with plain arrays — no module augmentation, no registry interface:

```typescript
export const campaignActions = [createCampaign, deleteCampaign];
```

### 2. Mount the Provider

Spread domain arrays into a single flat list:

```tsx
// root.tsx
import { ActionsProvider } from "react-router-actions";
import { campaignActions } from "~/domain/campaign/actions";
import { creatorActions } from "~/domain/creator/actions";

export default function Root() {
  return (
    <ActionsProvider actions={[...campaignActions, ...creatorActions]}>
      <Outlet />
    </ActionsProvider>
  );
}
```

### 3. Write the route handler

Each route's `clientAction` deserializes and executes the action. You own this function — wire in auth, toasts, error extraction, whatever your app needs:

```typescript
// lib/handle-action.ts
import {
  resolveFormData,
  actionSuccess,
  actionFailure,
  type ActionResult,
} from "react-router-actions";

export async function handleAction({
  request,
}: {
  request: Request;
}): Promise<ActionResult> {
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

### 4. Use in features

Pass the action creator to `useAction`. Types flow from the definition — no strings, no registry:

```tsx
import { useAction } from "react-router-actions";
import { createCampaign } from "~/domain/campaign/actions";

function CreateCampaignButton() {
  const [submit, { state, data }] = useAction(createCampaign, {
    onSuccess: (result) => {
      navigate(`/campaigns/${result.id}`);
    },
    onError: (error) => {
      toast.error(String(error));
    },
  });

  return (
    <button
      onClick={() => submit({ name: "Summer", budget: 5000 })}
      disabled={state !== "idle"}
    >
      {state === "submitting" ? "Creating..." : "Create Campaign"}
    </button>
  );
}
```

Install to working mutation in under 2 minutes.

## Optional Fields and Defaults

| Field | Default | Description |
| --- | --- | --- |
| `type` | *required* | Unique string identifier |
| `resolve` | *required* | `(payload, context?) => result` |
| `method` | `"POST"` | HTTP method for `fetcher.submit` |
| `name` | same as `type` | Display name for logging/devtools |
| `meta` | `undefined` | Static metadata (typed via `TMeta` generic) |

## Meta and Dynamic Overrides

Attach static metadata to an action via the `meta` field, typed with the `TMeta` generic:

```typescript
interface ToastMeta {
  successMessage: string;
  errorMessage: string;
}

const createCampaign = defineAction<
  "campaign/create",
  { name: string },
  { id: string },
  void,
  ToastMeta
>({
  type: "campaign/create",
  resolve: (payload) => api.campaigns.create(payload),
  meta: {
    successMessage: "Campaign created",
    errorMessage: "Failed to create campaign",
  },
});
```

Override meta dynamically from within `resolve` using `withMetaOverrides`:

```typescript
import { defineAction, withMetaOverrides } from "react-router-actions";

const createCampaign = defineAction<
  "campaign/create",
  { name: string },
  { id: string },
  void,
  ToastMeta
>({
  type: "campaign/create",
  resolve: async (payload) => {
    const result = await api.campaigns.create(payload);
    if (result.requiresApproval) {
      return withMetaOverrides(result, {
        successMessage: `"${payload.name}" created — pending approval`,
      });
    }
    return result;
  },
  meta: {
    successMessage: "Campaign created",
    errorMessage: "Failed to create campaign",
  },
});
```

When `resolve` returns a plain value, the static meta is used. When it returns a `withMetaOverrides` wrapper, the overrides are merged into the static meta for that invocation. The data is unwrapped automatically — consumers always see the raw result.

## Handler Recipe with Auth and Toasts

```typescript
// lib/handle-action.ts
import {
  resolveFormData,
  actionSuccess,
  actionFailure,
  type ActionResult,
} from "react-router-actions";
import { auth } from "~/auth";

export async function handleAction({
  request,
}: {
  request: Request;
}): Promise<ActionResult> {
  const formData = await request.formData();
  const action = resolveFormData(formData);

  try {
    const token = await auth.getTokenSilently();
    const response = await action.resolve(token);
    return actionSuccess(action, response);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return actionFailure(action, error);
  }
}
```

### Toast Recipe

With `onSuccess`/`onError` on the hook, you wire toasts inline — no `useEffect`:

```tsx
const [submit, { state }] = useAction(createCampaign, {
  onSuccess: () => toast.success("Campaign created!"),
  onError: (err) => toast.error(String(err)),
});
```

Or read the action's meta in the handler:

```typescript
const response = await action.resolve(token);
toast.success(action.meta.successMessage);
return actionSuccess(action, response);
```

## Optimistic UI

```tsx
const [submit, { pendingPayload }] = useAction(deleteCampaign);
const pendingId = pendingPayload?.id ?? null;

const visible = pendingId
  ? items.filter((item) => item.id !== pendingId)
  : items;
```

`pendingPayload` is deserialized from `fetcher.formData` and auto-clears on settle. On error, the row reappears automatically.

## Auth and Context

The `TContext` generic controls what `resolve` receives as its second argument. It defaults to `void`:

```typescript
// No context needed — resolve takes only payload
const simple = defineAction({
  type: "simple",
  resolve: (payload: { name: string }) => doSomething(payload),
});

// Token-based auth — resolve takes (payload, token)
const authed = defineAction({
  type: "authed",
  resolve: (payload: { id: string }, token: string) =>
    api.fetch(payload.id, { token }),
});

// Rich context — resolve takes (payload, ctx)
const rich = defineAction({
  type: "rich",
  resolve: (payload: Payload, ctx: { token: string; userId: string }) =>
    api.mutate(payload, ctx),
});
```

The handler passes context when calling `action.resolve(context)`.

## TanStack Query

Call the action creator directly — it returns an `ActionObject` for use outside the React Router fetcher path:

```typescript
import { createCampaign } from "~/domain/campaign/actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";

function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { name: string; budget: number }) => {
      const action = createCampaign(payload);
      return action.resolve();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
}
```

## Server Actions

The same action definitions work in React Router server `action` exports. The core (`defineAction`, serialization) has zero React dependencies:

```typescript
// routes/campaigns.server.ts
import {
  resolveFormData,
  actionSuccess,
  type ActionResult,
} from "react-router-actions";

export async function action({
  request,
}: Route.ActionArgs): Promise<ActionResult> {
  const formData = await request.formData();
  const action = resolveFormData(formData);
  const result = await action.resolve(getServerContext());
  return actionSuccess(action, result);
}
```

## Serialization

Payloads are serialized with [SuperJSON](https://github.com/blitz-js/superjson) (~2KB), preserving types that `JSON.stringify` drops: **Date**, **Map**, **Set**, **BigInt**, **undefined**, **RegExp**, **NaN**, **Infinity**.

`File` and `Blob` values are extracted from the payload tree and appended as native `FormData` entries, so they travel over the wire without base64 encoding. On deserialization, they're reinserted at their original paths.

## API Reference

### Functions

| Export | Description |
| --- | --- |
| `defineAction(config)` | Define a callable action creator from a config object |
| `withMetaOverrides(data, overrides)` | Wrap a resolve return value with dynamic meta overrides |
| `isMetaOverride(value)` | Type guard — returns `true` if the value is a `MetaOverrideResult` |
| `actionSuccess(action, response)` | Create a success `ActionResult` envelope |
| `actionFailure(action, error)` | Create a failure `ActionResult` envelope |
| `resolveFormData(formData)` | Deserialize `FormData` into an `ActionObject` |
| `createFormData(creator, payload)` | Serialize an action creator + payload into `FormData` |
| `getDefinitionFor(creator)` | Retrieve the `ActionDefinition` for an `Action` |
| `ActionsProvider` | React component — registers actions and provides context |
| `useAction(action, options?)` | Typed hook wrapping `useFetcher` — returns `[submit, state]` tuple |

### Types

| Export | Description |
| --- | --- |
| `Action<TType, TPayload, TResult, TContext, TMeta>` | Callable action with identity properties |
| `ActionDefinition<TType, TPayload, TResult, TContext, TMeta>` | Shape of an action definition (post-defaults) |
| `ActionObject<TContext, TMeta>` | Runtime action instance with `resolve`, `payload`, `meta` |
| `ActionResult<TResult>` | Discriminated union: `{ success: true, response } \| { success: false, error }` |
| `ActionMethod` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"` |
| `MetaOverrideResult<T, TMeta>` | Tagged wrapper returned by `withMetaOverrides` |
| `ActionEvent` | Discriminated union of submit/success/error lifecycle events |
| `ActionEventHandler` | `(event: ActionEvent) => void` |
| `UseActionOptions<TResult>` | Options for `useAction`: `action?`, `onSuccess?`, `onError?` |
| `UseActionState<TResult, TPayload>` | State object: `state`, `data`, `pendingPayload` |

## License

ISC
