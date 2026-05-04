import type { Action, ActionDefinition, ActionMethod } from "./define-action";
import { isMetaOverride } from "./with-meta-overrides";

// ─── ActionObject ─────────────────────────────────────────────────

export interface ActionObject<
  TResult = unknown,
  TContext = void,
  TMeta = void,
> {
  readonly type: string;
  readonly method: ActionMethod;
  readonly payload: unknown;
  readonly meta: TMeta;
  resolve: [TContext] extends [void]
    ? () => Promise<TResult>
    : (context: TContext) => Promise<TResult>;
}

// ─── ActionResult ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- wide constraint accepts any Action variant
export type ActionResult<T extends Action<string, any, any, any, any> = Action<string, any, any, any, any>> =
  T extends Action<infer TType, any, infer TResult, any, any>
    ? { type: TType; success: true; response: Awaited<TResult> }
    | { type: TType; success: false; error: unknown }
    : never;

export interface ActionSuccess {
  type: string;
  success: true;
  response: unknown;
}

export interface ActionFailure {
  type: string;
  success: false;
  error: unknown;
}

export function actionSuccess(
  action: Pick<ActionObject, "type">,
  response: unknown,
): ActionSuccess {
  return { type: action.type, success: true, response };
}

export function actionFailure(
  action: Pick<ActionObject, "type">,
  error: unknown,
): ActionFailure {
  return { type: action.type, success: false, error };
}

// ─── buildActionObject ───────────────────────────────────────────

/**
 * Validates all ActionObject fields at construction time. The only gap
 * between this and ActionObject is the conditional resolve arity
 * (`() => Promise<TResult>` when TContext is void), bridged by a single cast.
 */
interface ActionObjectBase<TResult, TContext, TMeta> {
  readonly type: string;
  readonly method: ActionMethod;
  readonly payload: unknown;
  readonly meta: TMeta;
  resolve(context: TContext): Promise<TResult>;
}

export function buildActionObject<
  TResult = unknown,
  TContext = void,
  TMeta = void,
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- contravariant bypass: TPayload erased because payload is received as unknown
  def: ActionDefinition<string, any, TResult, TContext, TMeta>,
  payload: unknown,
  submitMeta?: Partial<TMeta>,
): ActionObject<TResult, TContext, TMeta> {
  let dynamicOverrides: Partial<TMeta> | undefined;

  const obj: ActionObjectBase<TResult, TContext, TMeta> = {
    type: def.type,
    method: def.method,
    payload,
    async resolve(context: TContext): Promise<TResult> {
      try {
        const raw = await def.resolve(payload, context);
        if (isMetaOverride(raw)) {
          dynamicOverrides = raw.overrides as Partial<TMeta>;
          return raw.data as TResult;
        }
        return raw as TResult;
      } catch (error) {
        if (isMetaOverride(error)) {
          dynamicOverrides = error.overrides as Partial<TMeta>;
          throw error.data;
        }
        throw error;
      }
    },
    get meta(): TMeta {
      if (submitMeta !== undefined || dynamicOverrides !== undefined) {
        return { ...def.meta, ...submitMeta, ...dynamicOverrides } as TMeta;
      }
      return def.meta;
    },
  };

  return obj as ActionObject<TResult, TContext, TMeta>;
}
