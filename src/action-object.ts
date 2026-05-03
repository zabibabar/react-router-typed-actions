import type { ActionDefinition, ActionMethod } from "./define-action";
import { isMetaOverride } from "./with-meta-overrides";

// ─── ActionObject ─────────────────────────────────────────────────

export interface ActionObject<TResult = unknown, TContext = void, TMeta = void> {
  readonly type: string;
  readonly method: ActionMethod;
  readonly payload: unknown;
  readonly meta: TMeta;
  resolve: [TContext] extends [void]
    ? () => Promise<TResult>
    : (context: TContext) => Promise<TResult>;
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

export function buildActionObject<TResult = unknown, TContext = void, TMeta = void>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- contravariant bypass: TPayload erased because payload is received as unknown
  def: ActionDefinition<string, any, TResult, TContext, TMeta>,
  payload: unknown,
  submitMeta?: Partial<TMeta>,
): ActionObject<TResult, TContext, TMeta> {
  let dynamicOverrides: Partial<TMeta> | undefined;

  const obj = {
    type: def.type,
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
      if (submitMeta !== undefined || dynamicOverrides !== undefined) {
        return { ...def.meta, ...submitMeta, ...dynamicOverrides } as TMeta;
      }
      return def.meta;
    },
  };

  return obj as unknown as ActionObject<TResult, TContext, TMeta>;
}
