// ─── Core ────────────────────────────────────────────────────────

import type { Action } from "./define-action";

export { defineAction } from "./define-action";
export type { Action, ActionDefinition, ActionMethod } from "./define-action";

/** Extract the resolved return type from an action creator. */
export type ActionResultOf<T> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- helper extracts TResult from any Action generic instance
  T extends Action<any, any, infer TResult, any, any>
    ? Awaited<TResult>
    : never;

// ─── Registry ───────────────────────────────────────────────────

export { registerActions } from "./registry";

// ─── Meta Overrides ──────────────────────────────────────────────

export { withMetaOverrides, isMetaOverride } from "./with-meta-overrides";
export type { MetaOverrideResult } from "./with-meta-overrides";

// ─── Action Object & Result ─────────────────────────────────────

export { actionSuccess, actionFailure } from "./action-object";
export type {
  ActionObject,
  ActionResult,
  ActionSuccess,
  ActionFailure,
} from "./action-object";

// ─── FormData ───────────────────────────────────────────────────

export { createFormData, resolveFormData } from "./form-data";

// ─── React Router Adapter ────────────────────────────────────────

export { useActionFetcher } from "./use-action-fetcher";
export type {
  UseActionFetcherOptions,
  UseActionFetcherState,
} from "./use-action-fetcher";
