/* eslint-disable @typescript-eslint/no-explicit-any */

export type ActionMethod = "get" | "post" | "put" | "patch" | "delete";

export type MessageFactory<TPayload> = string | ((payload: TPayload) => string);

export interface ActionDefinition<
  TType extends string = string,
  TPayload = unknown,
  TResult = unknown,
  TContext = void,
> {
  readonly type: TType;
  readonly method: ActionMethod;
  readonly resolve: (
    payload: TPayload,
    context: TContext,
  ) => TResult | Promise<TResult>;
  readonly successMessage: MessageFactory<TPayload>;
  readonly errorMessage: MessageFactory<TPayload>;
}

export function defineAction<
  TType extends string,
  TPayload,
  TResult,
  TContext = void,
>(config: {
  type: TType;
  method: ActionMethod;
  resolve: (payload: TPayload, context: TContext) => TResult | Promise<TResult>;
  successMessage: MessageFactory<TPayload>;
  errorMessage: MessageFactory<TPayload>;
}): ActionDefinition<TType, TPayload, TResult, TContext> {
  return config;
}

// ─── Action Module ───────────────────────────────────────────────

export type ActionDefinitionRecord<TContext = void> = Record<
  string,
  ActionDefinition<string, any, any, TContext>
>;

type ValidateActionKeys<
  T extends Record<string, ActionDefinition<string, any, any, any>>,
> = {
  [K in keyof T]: T[K] extends ActionDefinition<infer TType, any, any, any>
    ? TType extends K
      ? T[K]
      : never
    : never;
};

export function buildActionModule<
  TContext = void,
  T extends ActionDefinitionRecord<TContext> = ActionDefinitionRecord<TContext>,
>(definitions: T & ValidateActionKeys<T>): T {
  return definitions;
}

// ─── Type Utilities ──────────────────────────────────────────────

/** `{ [actionType]: payloadType }` map extracted from an action module. */
export type InferPayloadMap<T extends ActionDefinitionRecord<any>> = {
  [K in keyof T]: T[K] extends ActionDefinition<any, infer P, any, any>
    ? P
    : never;
};

/** `{ [actionType]: ActionDefinition }` map — use for ActionRegistry augmentation. */
export type InferActionMap<T extends ActionDefinitionRecord<any>> = {
  [K in keyof T]: T[K];
};

/** Union of all action definitions in a module. */
export type InferActions<T extends ActionDefinitionRecord<any>> = T[keyof T];

/**
 * Augment this interface for global type safety with `useAction` and `createAction`.
 *
 * @example
 * declare module "react-router-actions" {
 *   interface ActionRegistry extends InferActionMap<typeof allActions> {}
 * }
 */
export interface ActionRegistry {}
