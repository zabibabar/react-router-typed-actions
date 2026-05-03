/* eslint-disable @typescript-eslint/no-explicit-any */

import { buildActionObject, type ActionObject } from "./action-object";
import type { MetaOverrideResult } from "./with-meta-overrides";

// ─── Core types ───────────────────────────────────────────────────

export type ActionMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type ResolveReturn<TResult, TMeta> =
  | TResult
  | MetaOverrideResult<TResult, TMeta>
  | Promise<TResult>
  | Promise<MetaOverrideResult<TResult, TMeta>>;

export interface ActionDefinition<
  TType extends string = string,
  TPayload = unknown,
  TResult = unknown,
  TContext = void,
  TMeta = void,
> {
  readonly type: TType;
  readonly name: string;
  readonly method: ActionMethod;
  readonly resolve: (
    payload: TPayload,
    context: TContext,
  ) => ResolveReturn<TResult, TMeta>;
  readonly meta: TMeta;
}

// ─── ActionCreator ────────────────────────────────────────────────

export type ActionCreator<
  TType extends string = string,
  TPayload = unknown,
  TResult = unknown,
  TContext = void,
  TMeta = void,
> = {
  (payload: TPayload): ActionObject<TContext, TMeta>;
  readonly type: TType;
  readonly name: string;
  readonly method: ActionMethod;
};

// ─── Definition store (private) ───────────────────────────────────

const definitionStore = new WeakMap<Function, ActionDefinition>();

export function getDefinitionFor(
  creator: ActionCreator<string, any, any, any, any>,
): ActionDefinition | undefined {
  return definitionStore.get(creator);
}

// ─── defineAction ─────────────────────────────────────────────────

type DefineActionConfig<
  TType extends string,
  TPayload,
  TResult,
  TContext,
  TMeta,
> = {
  type: TType;
  name?: string;
  method?: ActionMethod;
  resolve: (
    payload: TPayload,
    context: TContext,
  ) => ResolveReturn<TResult, TMeta>;
} & ([TMeta] extends [void] ? { meta?: never } : { meta: TMeta });

export function defineAction<
  TType extends string,
  TPayload,
  TResult,
  TContext = void,
  TMeta = void,
>(
  config: DefineActionConfig<TType, TPayload, TResult, TContext, TMeta>,
): ActionCreator<TType, TPayload, TResult, TContext, TMeta> {
  const definition: ActionDefinition<TType, TPayload, TResult, TContext, TMeta> = {
    type: config.type,
    name: config.name ?? config.type,
    method: config.method ?? "POST",
    resolve: config.resolve,
    meta: (config as any).meta as TMeta,
  };

  const creator = ((payload: TPayload) =>
    buildActionObject(definition as ActionDefinition<string, any, any, TContext, TMeta>, payload)) as ActionCreator<
    TType,
    TPayload,
    TResult,
    TContext,
    TMeta
  >;

  Object.defineProperty(creator, "name", {
    value: definition.name,
    configurable: true,
  });

  Object.assign(creator, {
    type: definition.type,
    method: definition.method,
  });

  definitionStore.set(creator, definition);

  return creator;
}
