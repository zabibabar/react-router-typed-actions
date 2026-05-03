// ─── Core ────────────────────────────────────────────────────────

export { defineAction, getDefinitionFor } from "./define-action";
export type {
  ActionCreator,
  ActionDefinition,
  ActionMethod,
} from "./define-action";

// ─── Meta Overrides ──────────────────────────────────────────────

export { withMetaOverrides, isMetaOverride } from "./with-meta-overrides";
export type { MetaOverrideResult } from "./with-meta-overrides";

// ─── Action Object & Result ─────────────────────────────────────

export { actionSuccess, actionFailure } from "./action-object";
export type { ActionObject, ActionResult } from "./action-object";

// ─── FormData ───────────────────────────────────────────────────

export { createFormData, resolveFormData } from "./form-data";

// ─── React Router Adapter ────────────────────────────────────────

export { ActionsProvider, useAction } from "./adapter";
export type {
  ActionEvent,
  ActionEventHandler,
  UseActionOptions,
  UseActionState,
} from "./adapter";
