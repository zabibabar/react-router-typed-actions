/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ActionDefinition, ActionMethod, MessageFactory } from "./define-action";
import { isMessageOverride } from "./with-message-overrides";

// ─── ActionObject ─────────────────────────────────────────────────

export interface ActionObject<TContext = void> {
  readonly type: string;
  readonly name: string;
  readonly method: ActionMethod;
  readonly payload: unknown;
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

export function buildActionObject<TContext = void>(
  def: ActionDefinition<string, any, any, TContext>,
  payload: unknown,
): ActionObject<TContext> {
  let dynamicSuccess: string | undefined;
  let dynamicError: string | undefined;

  const obj = {
    type: def.type,
    name: def.name,
    method: def.method,
    payload,
    async resolve(context: TContext) {
      const raw = await def.resolve(payload, context);
      if (isMessageOverride(raw)) {
        dynamicSuccess = raw.overrides.successMessage;
        dynamicError = raw.overrides.errorMessage;
        return raw.data;
      }
      return raw;
    },
    get successMessage() {
      if (dynamicSuccess !== undefined) return dynamicSuccess;
      return resolveMessage(def.successMessage, payload);
    },
    get errorMessage() {
      if (dynamicError !== undefined) return dynamicError;
      return resolveMessage(def.errorMessage, payload);
    },
  };

  return obj as unknown as ActionObject<TContext>;
}
