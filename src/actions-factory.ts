import type { HTMLFormMethod } from "react-router";
import type { BaseClientAction, BaseClientActionOptions } from "./base-action";
import type {
  ActionConstructorRecord,
  InferActions,
  InferClassMap,
  InferPayloadMap,
} from "./type-utils";

/**
 * Creates a typed actions factory from a merged constructor map.
 *
 * @example
 * const allActionConstructors = {
 *   ...CampaignActions.actionConstructorMap,
 *   ...CreatorListActions.actionConstructorMap,
 * };
 *
 * export const { ActionsFactory, createAction } = createActionsFactory(allActionConstructors);
 * export type RootAction = InferActions<typeof allActionConstructors>;
 * export type RootActionClassMap = InferClassMap<typeof allActionConstructors>;
 */
export function createActionsFactory<T extends ActionConstructorRecord>(
  allActionConstructors: T
) {
  type PayloadMap = InferPayloadMap<T>;
  type ClassMap = InferClassMap<T>;
  type Action = InferActions<T>;

  // Explicitly typed so TS can correlate generic K with the correct constructor per key.
  type ConstructorMap = {
    [K in keyof PayloadMap]: new (
      payload: PayloadMap[K],
      options?: BaseClientActionOptions
    ) => ClassMap[K];
  };

  const actionConstructorMap =
    allActionConstructors as unknown as ConstructorMap;

  /**
   * Creates an action instance directly (useful outside of React Router / fetcher context).
   */
  function createAction<K extends keyof PayloadMap>(
    type: K,
    payload: PayloadMap[K],
    options?: BaseClientActionOptions
  ): ClassMap[K] {
    const ActionClass = actionConstructorMap[type];
    if (!ActionClass) {
      throw new Error(`Invalid action type: ${String(type)}`);
    }
    return new ActionClass(payload, options);
  }

  const ActionsFactory = {
    /**
     * A type-safe factory function that creates an action's FormData for use with fetcher.submit().
     * @param type The type of action to create (e.g., "createList").
     * @param payload The payload for that action, type-checked against the action's constructor.
     * @param options Optional overrides for success/error messages and loading toasts.
     * @returns An object containing `formData` and `method`.
     */
    createFormData<K extends keyof PayloadMap>(
      type: K,
      payload: PayloadMap[K],
      options?: BaseClientActionOptions
    ): { formData: FormData; method: HTMLFormMethod } {
      const action = createAction(type, payload, options);
      const formData = new FormData();
      formData.append("actionType", (action as BaseClientAction<unknown>).type);
      formData.append(
        "payload",
        JSON.stringify((action as BaseClientAction<unknown>).payload)
      );
      formData.append(
        "options",
        JSON.stringify((action as BaseClientAction<unknown>).options)
      );
      return { formData, method: (action as BaseClientAction<unknown>).method };
    },

    /**
     * Resolves a FormData object into an instance of the corresponding Action class.
     * @param formData The FormData object containing "actionType" and "payload".
     * @returns The instantiated Action class.
     */
    resolveFormData(formData: FormData): ClassMap[keyof PayloadMap] {
      const actionType = formData.get("actionType") as Action["type"];
      const payload = formData.get("payload") as string;

      if (!actionType || !payload) {
        throw new Error("Invalid form data: Missing actionType or payload.");
      }

      const ActionClass = actionConstructorMap[actionType as keyof PayloadMap];
      if (!ActionClass) {
        throw new Error(`Invalid action type: ${actionType}`);
      }

      const parsedPayload = JSON.parse(payload);
      const parsedOptions = formData.get("options")
        ? JSON.parse(formData.get("options") as string)
        : {};
      return new ActionClass(parsedPayload, parsedOptions);
    },
  };

  return { ActionsFactory, createAction };
}
