/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  ActionCreator,
  ActionDefinition,
  ActionMethod,
} from "./define-action";
import { buildActionObject, type ActionObject } from "./action-object";
import { serialize, deserialize, type FileEntry } from "./serialization";

export type { ActionObject } from "./action-object";
export type { ActionResult } from "./action-object";

// ─── Factory return type ─────────────────────────────────────────

export interface ActionsFactory<TContext = void, TMeta = void> {
  createFormData<TPayload>(
    action: ActionCreator<string, TPayload, any, TContext, TMeta>,
    payload: TPayload,
  ): { formData: FormData; method: ActionMethod };
  createFormData(
    type: string,
    payload: unknown,
  ): { formData: FormData; method: ActionMethod };
  resolveFormData(formData: FormData): ActionObject<TContext, TMeta>;
}

// ─── Factory ─────────────────────────────────────────────────────

export function createActionsFactory<TContext = void, TMeta = void>(
  creators: ActionCreator<string, any, any, TContext, TMeta>[],
): ActionsFactory<TContext, TMeta> {
  const lookup = new Map<
    string,
    ActionDefinition<string, any, any, TContext, TMeta>
  >();
  for (const creator of creators) {
    const def = (creator as any)._definition as ActionDefinition<string, any, any, TContext, TMeta>;
    lookup.set(creator.type, def);
  }

  function getDef(
    type: string,
  ): ActionDefinition<string, any, any, TContext, TMeta> {
    const def = lookup.get(type);
    if (!def) {
      throw new Error(
        `Invalid action type "${type}".`,
      );
    }
    return def;
  }

  function createFormData(
    typeOrCreator: string | ActionCreator<string, any, any, TContext, TMeta>,
    payload: unknown,
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
    for (const { path, file } of files) {
      formData.set(`file:${path}`, file);
    }

    return { formData, method: def.method };
  }

  function resolveFormData(formData: FormData): ActionObject<TContext, TMeta> {
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

    return buildActionObject(def, payload) as ActionObject<TContext, TMeta>;
  }

  return { createFormData, resolveFormData } as ActionsFactory<TContext, TMeta>;
}
