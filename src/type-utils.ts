import type { BaseClientAction, BaseClientActionOptions } from "./base-action";

export type ActionConstructorRecord = Record<
  string,
  new (payload: never, options?: BaseClientActionOptions) => BaseClientAction<unknown>
>;

/** Constraint that checks each key K matches InstanceType<Constructor>["type"]. */
type ValidateActionMap<T extends ActionConstructorRecord> = {
  [K in keyof T]: InstanceType<T[K]> extends { readonly type: K } ? T[K] : never;
};

/** Extracts the union of action instances from a constructor map. */
export type InferActions<T extends ActionConstructorRecord> = {
  [K in keyof T]: InstanceType<T[K]>;
}[keyof T];

/** Extracts a { [actionType]: payload } map from a constructor map. */
export type InferPayloadMap<T extends ActionConstructorRecord> = {
  [K in keyof T]: InstanceType<T[K]>["payload"];
};

/** Extracts a { [actionType]: actionInstance } map from a constructor map. */
export type InferClassMap<T extends ActionConstructorRecord> = {
  [K in keyof T]: InstanceType<T[K]>;
};

/**
 * Builds a typed actionConstructorMap from a plain object of action constructors.
 * Enforces that each key matches the action class's `type` property at compile time.
 *
 * @example
 * export const actionConstructorMap = buildActionModule({
 *   createFilterSet: CreateFilterSetAction,
 *   updateFilterSet: UpdateFilterSetAction,
 * });
 */
export function buildActionModule<T extends ActionConstructorRecord>(
  constructors: T & ValidateActionMap<T>,
): T {
  return constructors;
}
