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

export function actionSuccess<TResult>(
  action: Pick<ActionObject, "type">,
  response: TResult,
): ActionResult<TResult> {
  return { type: action.type, success: true, response };
}

export function actionFailure(
  action: Pick<ActionObject, "type">,
  error: unknown,
): ActionResult<never> {
  return { type: action.type, success: false, error };
}

// ─── buildActionObject ───────────────────────────────────────────

export function buildActionObject<TContext = void, TMeta = void>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    /**
     * Returns the action's metadata. Before `resolve()` is called, returns
     * the static meta from the definition. After `resolve()` completes,
     * returns static meta merged with any dynamic overrides from
     * `withMetaOverrides`.
     */
    get meta(): TMeta {
      if (dynamicOverrides !== undefined) {
        return { ...def.meta, ...dynamicOverrides } as TMeta;
      }
      return def.meta;
    },
  };

  return obj as unknown as ActionObject<TContext, TMeta>;
}
