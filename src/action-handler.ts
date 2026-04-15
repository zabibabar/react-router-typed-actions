import type { BaseClientAction } from "./base-action";
import type { ActionConstructorRecord, InferActions, InferClassMap } from "./type-utils";
import type { createActionsFactory } from "./actions-factory";

/**
 * Return type for action handlers — discriminated union on `type` and `success`.
 */
export type ActionHandlerReturn<
  T extends ActionConstructorRecord,
  K extends InferActions<T>["type"] = InferActions<T>["type"],
> = {
  [Type in K]:
    | {
        type: Type;
        success: true;
        response: Awaited<ReturnType<InferClassMap<T>[Type]["resolve"]>>;
      }
    | {
        type: Type;
        success: false;
        error: unknown;
      };
}[K];

export interface ActionHandlerDependencies {
  /** Return an auth token (e.g. from Auth0, Clerk, etc.) */
  getToken: () => string | Promise<string>;

  /** Extract a user-friendly error message/object from a caught error */
  extractError?: (error: unknown) => unknown | Promise<unknown>;

  /** Called on successful action resolution (e.g. show a success toast) */
  onSuccess?: (message: string) => void;

  /** Called on failed action resolution (e.g. show an error toast) */
  onError?: (message: string) => void;

  /**
   * Called for long-running actions when `showLoadingToast` is true.
   * Receives the promise so you can wire it into a toast.promise()-style API.
   */
  onLoading?: (promise: Promise<unknown>, messages: { loading: string; success: string; error: string }) => void;
}

export interface HandleActionOptions {
  showToasts?: boolean;
}

/**
 * Creates a reusable `handleAction` function bound to your factory and dependencies.
 *
 * @example
 * const handleAction = createActionHandler(ActionsFactory, {
 *   getToken: () => auth0.getTokenSilently(),
 *   onSuccess: (msg) => toast.success(msg),
 *   onError: (msg) => toast.error(msg),
 *   extractError: (err) => extractErrorMessage(err),
 * });
 *
 * // In a React Router clientAction:
 * export async function clientAction(args: ClientActionFunctionArgs) {
 *   return handleAction(args);
 * }
 */
export function createActionHandler<T extends ActionConstructorRecord>(
  factory: ReturnType<typeof createActionsFactory<T>>,
  deps: ActionHandlerDependencies,
) {
  return async function handleAction(
    args: { request: Request },
    options: HandleActionOptions = {},
  ): Promise<ActionHandlerReturn<T>> {
    const { showToasts = true } = options;
    const { request } = args;

    const token = await deps.getToken();
    const formData = await request.formData();
    const action = factory.ActionsFactory.resolveFormData(formData) as BaseClientAction<unknown>;

    try {
      const resolvePromise = action.resolve(token);

      // Show loading toast if enabled
      if (showToasts && action.options.showLoadingToast && deps.onLoading) {
        deps.onLoading(resolvePromise as Promise<unknown>, {
          loading: action.options.loadingMessage ?? "Loading...",
          success: action.successMessage,
          error: action.errorMessage,
        });
      }

      const response = await resolvePromise;

      // Only show success toast if loading toast wasn't used
      if (showToasts && !action.options.showLoadingToast && deps.onSuccess) {
        deps.onSuccess(action.successMessage);
      }

      return {
        type: action.type,
        response,
        success: true,
      } as ActionHandlerReturn<T>;
    } catch (error) {
      console.warn("Client action error:", error);

      const extractedError = deps.extractError
        ? await deps.extractError(error)
        : error;

      // Only show error toast if loading toast wasn't used
      if (showToasts && !action.options.showLoadingToast && deps.onError) {
        deps.onError(action.errorMessage);
      }

      return {
        type: action.type,
        success: false,
        error: extractedError,
      } as ActionHandlerReturn<T>;
    }
  };
}
