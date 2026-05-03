/* eslint-disable @typescript-eslint/no-explicit-any */

import { buildActionObject, type ActionObject } from "./action-object";

// ─── Core types ───────────────────────────────────────────────────

export type ActionMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type MessageFactory<TPayload> =
  | string
  | ((payload: TPayload) => string);

export interface ActionDefinition<
  TType extends string = string,
  TPayload = unknown,
  TResult = unknown,
  TContext = void,
> {
  readonly type: TType;
  readonly name: string;
  readonly method: ActionMethod;
  readonly resolve: (
    payload: TPayload,
    context: TContext,
  ) => TResult | Promise<TResult>;
  readonly successMessage?: MessageFactory<TPayload>;
  readonly errorMessage?: MessageFactory<TPayload>;
}

// ─── ActionCreator ────────────────────────────────────────────────

export type ActionCreator<
  TType extends string = string,
  TPayload = unknown,
  TResult = unknown,
  TContext = void,
> = {
  (payload: TPayload): ActionObject<TContext>;
} & ActionDefinition<TType, TPayload, TResult, TContext>;

// ─── defineAction ─────────────────────────────────────────────────

export function defineAction<
  TType extends string,
  TPayload,
  TResult,
  TContext = void,
>(config: {
  type: TType;
  name?: string;
  method?: ActionMethod;
  resolve: (
    payload: TPayload,
    context: TContext,
  ) => TResult | Promise<TResult>;
  successMessage?: MessageFactory<TPayload>;
  errorMessage?: MessageFactory<TPayload>;
}): ActionCreator<TType, TPayload, TResult, TContext> {
  const definition: ActionDefinition<TType, TPayload, TResult, TContext> = {
    type: config.type,
    name: config.name ?? config.type,
    method: config.method ?? "POST",
    resolve: config.resolve,
    successMessage: config.successMessage,
    errorMessage: config.errorMessage,
  };

  const creator = ((payload: TPayload) =>
    buildActionObject(definition as ActionDefinition<string, any, any, TContext>, payload)) as ActionCreator<
    TType,
    TPayload,
    TResult,
    TContext
  >;

  Object.defineProperty(creator, "name", {
    value: definition.name,
    configurable: true,
  });

  Object.assign(creator, {
    type: definition.type,
    method: definition.method,
    resolve: definition.resolve,
    successMessage: definition.successMessage,
    errorMessage: definition.errorMessage,
  });

  return creator;
}

