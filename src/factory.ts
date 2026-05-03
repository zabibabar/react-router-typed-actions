/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  ActionCreator,
  ActionDefinition,
  ActionMethod,
} from "./define-action";
import { buildActionObject, type ActionObject, type ActionObjectOptions } from "./action-object";
import { serialize, deserialize, type FileEntry } from "./serialization";

export type { ActionObject } from "./action-object";
export type { ActionResult } from "./action-object";

// ─── Factory return type ─────────────────────────────────────────

export interface ActionsFactory<TContext = void> {
  createFormData<TPayload>(
    action: ActionCreator<string, TPayload, any, TContext>,
    payload: TPayload,
    options?: ActionObjectOptions,
  ): { formData: FormData; method: ActionMethod };
  createFormData(
    type: string,
    payload: unknown,
    options?: ActionObjectOptions,
  ): { formData: FormData; method: ActionMethod };
  resolveFormData(formData: FormData): ActionObject<TContext>;
}

// ─── Factory ─────────────────────────────────────────────────────

export function createActionsFactory<TContext = void>(
  definitions: ActionDefinition<string, any, any, TContext>[],
): ActionsFactory<TContext> {
  const lookup = new Map<
    string,
    ActionDefinition<string, any, any, TContext>
  >();
  for (const def of definitions) {
    lookup.set(def.type, def);
  }

  function getDef(
    type: string,
  ): ActionDefinition<string, any, any, TContext> {
    const def = lookup.get(type);
    if (!def) {
      throw new Error(
        `Invalid action type "${type}".`,
      );
    }
    return def;
  }

  function createFormData(
    typeOrCreator: string | ActionCreator<string, any, any, TContext>,
    payload: unknown,
    options?: ActionObjectOptions,
  ): { formData: FormData; method: ActionMethod } {
    const type =
      typeof typeOrCreator === "string"
        ? typeOrCreator
        : typeOrCreator.type;
    const def = getDef(type);
    const { encoded, files } = serialize(payload);

    const formData = new FormData();
    formData.set("actionType", type);
    formData.set("payload", encoded);
    if (options) {
      formData.set("options", JSON.stringify(options));
    }
    for (const { path, file } of files) {
      formData.set(`file:${path}`, file);
    }

    return { formData, method: def.method };
  }

  function resolveFormData(formData: FormData): ActionObject<TContext> {
    const actionType = formData.get("actionType");
    const encodedPayload = formData.get("payload");

    if (
      typeof actionType !== "string" ||
      typeof encodedPayload !== "string"
    ) {
      throw new Error(
        "react-router-actions: Invalid FormData — missing actionType or payload.",
      );
    }

    const def = getDef(actionType);

    const files: FileEntry[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("file:") && value instanceof Blob) {
        files.push({ path: key.slice(5), file: value });
      }
    }

    const payload = deserialize(encodedPayload, files);

    const rawOptions = formData.get("options");
    const options: ActionObjectOptions =
      typeof rawOptions === "string" ? JSON.parse(rawOptions) : {};

    return buildActionObject(def, payload, options) as ActionObject<TContext>;
  }

  return { createFormData, resolveFormData } as ActionsFactory<TContext>;
}
