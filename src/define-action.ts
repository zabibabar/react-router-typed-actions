import { buildActionObject, type ActionObject } from "./action-object"
import type { MetaOverrideResult } from "./with-meta-overrides"

// ─── Core types ───────────────────────────────────────────────────

export type ActionMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

type ResolveReturn<TResult, TMeta> =
  | TResult
  | MetaOverrideResult<TResult, TMeta>
  | Promise<TResult>
  | Promise<MetaOverrideResult<TResult, TMeta>>

export interface ActionDefinition<
  TType extends string = string,
  TPayload = unknown,
  TResult = unknown,
  TContext = void,
  TMeta = void,
> {
  readonly type: TType
  readonly method: ActionMethod
  readonly resolve: (payload: TPayload, context: TContext) => ResolveReturn<TResult, TMeta>
  readonly meta: TMeta
}

// ─── Action ──────────────────────────────────────────────────────

export type Action<
  TType extends string = string,
  TPayload = unknown,
  TResult = unknown,
  TContext = void,
  TMeta = void,
> = {
  (payload: TPayload): ActionObject<TResult, TContext, TMeta>
  readonly type: TType
  readonly method: ActionMethod
}

// ─── Definition store (private) ───────────────────────────────────

const definitionStore = new WeakMap<
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- function identity is used only as WeakMap key
  Function,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- store intentionally erases generic parameters across heterogeneous actions
  ActionDefinition<string, any, any, any, any>
>()

export function getDefinitionFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any action creator generic shape
  creator: Action<string, any, any, any, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- return type intentionally erased for heterogeneous store
): ActionDefinition<string, any, any, any, any> | undefined {
  return definitionStore.get(creator)
}

// ─── defineAction ─────────────────────────────────────────────────

type DefineActionConfig<TType extends string, TPayload, TResult, TContext, TMeta> = {
  type: TType
  method?: ActionMethod
  resolve: (payload: TPayload, context: TContext) => ResolveReturn<TResult, TMeta>
} & ([TMeta] extends [void] ? { meta?: never } : { meta: TMeta })

export function defineAction<
  TType extends string,
  TPayload,
  TResult,
  TContext = void,
  TMeta = void,
>(
  config: DefineActionConfig<TType, TPayload, TResult, TContext, TMeta>,
): Action<TType, TPayload, TResult, TContext, TMeta> {
  const definition: ActionDefinition<TType, TPayload, TResult, TContext, TMeta> = {
    type: config.type,
    method: config.method ?? "POST",
    resolve: config.resolve,
    meta: (config as { meta?: TMeta }).meta as TMeta,
  }

  const creator = ((payload: TPayload) =>
    buildActionObject(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload type is erased at runtime and consumed as unknown
      definition as ActionDefinition<string, any, TResult, TContext, TMeta>,
      payload,
    )) as Action<TType, TPayload, TResult, TContext, TMeta>

  Object.assign(creator, {
    type: definition.type,
    method: definition.method,
  })

  definitionStore.set(creator, definition)

  return creator
}
