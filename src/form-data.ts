import type { Action, ActionMethod } from "./define-action";
import { buildActionObject, type ActionObject } from "./action-object";
import { serialize, deserialize, type FileEntry } from "./serialization";
import { getDefinition } from "./registry";

export function createFormData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- existential erasure: accepts any Action regardless of generic params
  action: Action<string, any, any, any, any>,
  payload: unknown,
  metaOverrides?: Record<string, unknown>,
): { formData: FormData; method: ActionMethod } {
  const { encoded, files } = serialize(payload);

  const formData = new FormData();
  formData.set("actionType", action.type);
  formData.set("payload", encoded);
  for (const { path, file } of files) {
    formData.set(`file:${path}`, file);
  }

  if (metaOverrides) {
    const { encoded: metaEncoded } = serialize(metaOverrides);
    formData.set("metaOverrides", metaEncoded);
  }

  return { formData, method: action.method };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TContext=any for bivariant resolve(); TMeta=any because definition type is unknown at deserialization
export function resolveFormData(formData: FormData): ActionObject<unknown, any, any> {
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

  const rawMeta = formData.get("metaOverrides");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type is erased at deserialization boundary
  const submitMeta = typeof rawMeta === "string" ? (deserialize(rawMeta, []) as any) : undefined;

  return buildActionObject(def, payload, submitMeta);
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
