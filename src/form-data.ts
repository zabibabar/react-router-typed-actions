/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ActionMethod } from "./define-action";
import { buildActionObject, type ActionObject } from "./action-object";
import { serialize, deserialize, type FileEntry } from "./serialization";
import { getDefinition } from "./registry";

export function createFormData(
  type: string,
  payload: unknown,
): { formData: FormData; method: ActionMethod } {
  const def = getDefinition(type);
  const { encoded, files } = serialize(payload);

  const formData = new FormData();
  formData.set("actionType", type);
  formData.set("payload", encoded);
  for (const { path, file } of files) {
    formData.set(`file:${path}`, file);
  }

  return { formData, method: def.method };
}

export function resolveFormData(formData: FormData): ActionObject<any, any> {
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

  const def = getDefinition(actionType);
  const payload = deserializePayload(formData);
  return buildActionObject(def, payload);
}

export function deserializePayload(formData: FormData): unknown {
  const encodedPayload = formData.get("payload");
  if (typeof encodedPayload !== "string") return undefined;

  const files: FileEntry[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("file:") && value instanceof Blob) {
      files.push({ path: key.slice(5), file: value });
    }
  }

  return deserialize(encodedPayload, files);
}
