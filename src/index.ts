// ─── Core ────────────────────────────────────────────────────────

export { defineAction, getDefinitionFor } from "./define-action";
export type {
  Action,
  ActionDefinition,
  ActionMethod,
} from "./define-action";

// ─── Registry ───────────────────────────────────────────────────

export { registerSlice } from "./registry";

// ─── Meta Overrides ──────────────────────────────────────────────

export { withMetaOverrides, isMetaOverride } from "./with-meta-overrides";
export type { MetaOverrideResult } from "./with-meta-overrides";

// ─── Action Object & Result ─────────────────────────────────────

export { actionSuccess, actionFailure } from "./action-object";
export type { ActionObject, ActionResult } from "./action-object";

// ─── FormData ───────────────────────────────────────────────────

export { createFormData, resolveFormData } from "./form-data";

// ─── React Router Adapter ────────────────────────────────────────

export { useAction } from "./adapter";
export type {
  UseActionOptions,
  UseActionState,
} from "./adapter";
