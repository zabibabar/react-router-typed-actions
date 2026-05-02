// ─── Core ────────────────────────────────────────────────────────

export { defineAction, buildActionModule } from "./define-action";
export type {
  ActionDefinition,
  ActionDefinitionRecord,
  ActionMethod,
  MessageFactory,
  SchemaLike,
  InferPayloadMap,
  InferActionMap,
  InferActions,
  ActionRegistry,
} from "./define-action";

// ─── Serialization (internal, but types are useful) ──────────────

export type { FileEntry, SerializeResult } from "./serialization";

// ─── Factory ─────────────────────────────────────────────────────

export { createActionsFactory } from "./factory";
export type { ActionOptions, ActionObject } from "./factory";

// ─── React Router Adapter ────────────────────────────────────────

export {
  ActionsProvider,
  useAction,
  resolveFormData,
  createAction,
} from "./adapter";
export type {
  ActionsProviderProps,
  UseActionReturn,
  ActionResult,
} from "./adapter";
