/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ActionDefinition, ActionMethod } from "./define-action";
import { buildActionObject, type ActionObject } from "./action-object";
import { serialize, deserialize, type FileEntry } from "./serialization";

export type { ActionObject } from "./action-object";
export type { ActionResult } from "./action-object";

// ─── Factory ─────────────────────────────────────────────────────

export function createActionsFactory(definitions: ActionDefinition[]) {
  const lookup = new Map<string, ActionDefinition>();
  for (const def of definitions) {
    lookup.set(def.type, def);
  }

  function getDef(type: string): ActionDefinition {
    const def = lookup.get(type);
    if (!def) {
      throw new Error(
        `react-router-actions: Unknown action type "${type}".`,
      );
    }
    return def;
  }

  function createFormData(
    type: string,
    payload: unknown,
  ): { formData: FormData; method: ActionMethod } {
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

  function resolveFormData(formData: FormData): ActionObject<any> {
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

    return buildActionObject(def, payload);
  }

  return { createFormData, resolveFormData };
}
