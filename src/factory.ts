/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  ActionDefinition,
  ActionDefinitionRecord,
  ActionMethod,
  InferPayloadMap,
  MessageFactory,
} from "./define-action";
import { serialize, deserialize, type FileEntry } from "./serialization";

// ─── Public types ────────────────────────────────────────────────

export interface ActionOptions {
  successMessageOverride?: string;
  errorMessageOverride?: string;
}

export interface ActionObject {
  readonly type: string;
  readonly method: ActionMethod;
  readonly payload: unknown;
  resolve(context: any): Promise<unknown>;
  readonly successMessage: string;
  readonly errorMessage: string;
}

// ─── Dynamic resolve detection ───────────────────────────────────

interface DynamicResolveResult {
  data: unknown;
  successMessage?: string;
  errorMessage?: string;
}

function isDynamicResult(value: unknown): value is DynamicResolveResult {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return "data" in obj && ("successMessage" in obj || "errorMessage" in obj);
}

// ─── Helpers ─────────────────────────────────────────────────────

function resolveMessage(
  factory: MessageFactory<unknown>,
  payload: unknown,
): string {
  return typeof factory === "function" ? factory(payload) : factory;
}

function buildActionObject(
  def: ActionDefinition,
  payload: unknown,
  options?: ActionOptions,
): ActionObject {
  let dynamicSuccess: string | undefined;
  let dynamicError: string | undefined;

  return {
    type: def.type,
    method: def.method,
    payload,
    async resolve(context: any) {
      const raw = await def.resolve(payload, context);
      if (isDynamicResult(raw)) {
        dynamicSuccess = raw.successMessage;
        dynamicError = raw.errorMessage;
        return raw.data;
      }
      return raw;
    },
    get successMessage() {
      if (options?.successMessageOverride) return options.successMessageOverride;
      if (dynamicSuccess !== undefined) return dynamicSuccess;
      return resolveMessage(def.successMessage, payload);
    },
    get errorMessage() {
      if (options?.errorMessageOverride) return options.errorMessageOverride;
      if (dynamicError !== undefined) return dynamicError;
      return resolveMessage(def.errorMessage, payload);
    },
  };
}

// ─── Factory ─────────────────────────────────────────────────────

export function createActionsFactory<T extends ActionDefinitionRecord<any>>(
  modules: T,
) {
  type PayloadMap = InferPayloadMap<T>;

  function getDef(type: string): ActionDefinition {
    const def = modules[type];
    if (!def) {
      throw new Error(
        `react-router-actions: Unknown action type "${type}".`,
      );
    }
    return def;
  }

  function createFormData<K extends keyof PayloadMap & string>(
    type: K,
    payload: PayloadMap[K],
    options?: ActionOptions,
  ): { formData: FormData; method: ActionMethod } {
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

  function resolveFormData(formData: FormData): ActionObject {
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

    if (def.schema) {
      try {
        def.schema.parse(payload);
      } catch (err) {
        const detail =
          err instanceof Error ? err.message : JSON.stringify(err);
        throw new Error(
          `react-router-actions: Payload validation failed for action "${actionType}". ${detail}`,
        );
      }
    }

    const rawOptions = formData.get("options");
    const options: ActionOptions | undefined =
      typeof rawOptions === "string" ? JSON.parse(rawOptions) : undefined;

    return buildActionObject(def, payload, options);
  }

  function createAction<K extends keyof PayloadMap & string>(
    type: K,
    payload: PayloadMap[K],
    options?: ActionOptions,
  ): ActionObject {
    const def = getDef(type);
    return buildActionObject(def, payload, options);
  }

  return { createFormData, resolveFormData, createAction };
}
