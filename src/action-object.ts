/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ActionDefinition, ActionMethod } from "./define-action";
import { isMetaOverride } from "./with-meta-overrides";

// ─── ActionObject ─────────────────────────────────────────────────

export interface ActionObject<TContext = void, TMeta = void> {
  readonly type: string;
  readonly name: string;
  readonly method: ActionMethod;
  readonly payload: unknown;
  readonly meta: TMeta;
  resolve: [TContext] extends [void]
    ? () => Promise<unknown>
    : (context: TContext) => Promise<unknown>;
}

// ─── ActionResult ─────────────────────────────────────────────────

export type ActionResult<TResult = unknown> =
  | { type: string; success: true; response: TResult }
  | { type: string; success: false; error: unknown };

// ─── buildActionObject ───────────────────────────────────────────

export function buildActionObject<TContext = void, TMeta = void>(
  def: ActionDefinition<string, any, any, TContext, TMeta>,
  payload: unknown,
): ActionObject<TContext, TMeta> {
  let dynamicOverrides: Partial<TMeta> | undefined;

  const obj = {
    type: def.type,
    name: def.name,
    method: def.method,
    payload,
    async resolve(context: TContext) {
      try {
        const raw = await def.resolve(payload, context);
        if (isMetaOverride(raw)) {
          dynamicOverrides = raw.overrides as Partial<TMeta>;
          return raw.data;
        }
        return raw;
      } catch (error) {
        if (isMetaOverride(error)) {
          dynamicOverrides = error.overrides as Partial<TMeta>;
          throw error.data;
        }
        throw error;
      }
    },
    get meta(): TMeta {
      if (dynamicOverrides !== undefined) {
        return { ...def.meta, ...dynamicOverrides } as TMeta;
      }
      return def.meta;
    },
  };

  return obj as unknown as ActionObject<TContext, TMeta>;
}
