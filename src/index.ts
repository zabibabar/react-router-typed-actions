// ─── Core ────────────────────────────────────────────────────────

export { defineAction } from "./define-action";
export type {
  ActionCreator,
  ActionDefinition,
  ActionMethod,
} from "./define-action";

// ─── Meta Overrides ──────────────────────────────────────────────

export { withMetaOverrides, isMetaOverride } from "./with-meta-overrides";
export type { MetaOverrideResult } from "./with-meta-overrides";

// ─── Factory ─────────────────────────────────────────────────────

export { createActionsFactory } from "./factory";
export type { ActionsFactory } from "./factory";
export type { ActionObject, ActionResult } from "./action-object";

// ─── React Router Adapter ────────────────────────────────────────

export { ActionsProvider, useAction, resolveFormData } from "./adapter";
export type {
  ActionEvent,
  ActionEventHandler,
  UseActionOptions,
  UseActionState,
} from "./adapter";
