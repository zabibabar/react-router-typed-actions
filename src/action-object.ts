/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ActionDefinition, ActionMethod } from "./define-action";
import { isMetaOverride } from "./with-meta-overrides";

type MessageFactory<TPayload> = string | ((payload: TPayload) => string);

// ─── ActionObject ─────────────────────────────────────────────────

export interface ActionObjectOptions {
  showLoadingToast?: boolean;
  loadingMessage?: string;
  successMessageOverride?: string;
  errorMessageOverride?: string;
}

export interface ActionObject<TContext = void, TMeta = void> {
  readonly type: string;
  readonly name: string;
  readonly method: ActionMethod;
  readonly payload: unknown;
  readonly options: ActionObjectOptions;
  resolve: [TContext] extends [void]
    ? () => Promise<unknown>
    : (context: TContext) => Promise<unknown>;
  readonly successMessage: string | undefined;
  readonly errorMessage: string | undefined;
}

// ─── ActionResult ─────────────────────────────────────────────────

export type ActionResult<TResult = unknown> =
  | { type: string; success: true; response: TResult }
  | { type: string; success: false; error: unknown };

// ─── Helpers ──────────────────────────────────────────────────────

export function resolveMessage(
  factory: MessageFactory<unknown> | undefined,
  payload: unknown,
): string | undefined {
  if (factory === undefined) return undefined;
  return typeof factory === "function" ? factory(payload) : factory;
}

// ─── buildActionObject ───────────────────────────────────────────

export function buildActionObject<TContext = void, TMeta = void>(
  def: ActionDefinition<string, any, any, TContext, TMeta>,
  payload: unknown,
  options: ActionObjectOptions = {},
): ActionObject<TContext, TMeta> {
  let dynamicSuccess: string | undefined;
  let dynamicError: string | undefined;

  const obj = {
    type: def.type,
    name: def.name,
    method: def.method,
    payload,
    options,
    async resolve(context: TContext) {
      try {
        const raw = await def.resolve(payload, context);
        if (isMetaOverride(raw)) {
          dynamicSuccess = raw.overrides.successMessage;
          dynamicError = raw.overrides.errorMessage;
          return raw.data;
        }
        return raw;
      } catch (error) {
        if (isMetaOverride(error)) {
          dynamicSuccess = error.overrides.successMessage;
          dynamicError = error.overrides.errorMessage;
          throw error.data;
        }
        throw error;
      }
    },
    get successMessage() {
      if (dynamicSuccess !== undefined) return dynamicSuccess;
      if (options.successMessageOverride !== undefined) return options.successMessageOverride;
      return resolveMessage(def.successMessage, payload);
    },
    get errorMessage() {
      if (dynamicError !== undefined) return dynamicError;
      if (options.errorMessageOverride !== undefined) return options.errorMessageOverride;
      return resolveMessage(def.errorMessage, payload);
    },
  };

  return obj as unknown as ActionObject<TContext, TMeta>;
}
