const META_OVERRIDE_SYMBOL: unique symbol = Symbol.for(
  "react-router-actions:meta-override",
);

export interface MetaOverrideResult<T, TMeta> {
  readonly [META_OVERRIDE_SYMBOL]: true;
  readonly data: T;
  readonly overrides: Partial<TMeta>;
}

export function withMetaOverrides<T, TMeta>(
  data: T,
  overrides: Partial<TMeta>,
): MetaOverrideResult<T, TMeta> {
  return {
    [META_OVERRIDE_SYMBOL]: true,
    data,
    overrides,
  };
}

export function isMetaOverride(
  value: unknown,
): value is MetaOverrideResult<unknown, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    META_OVERRIDE_SYMBOL in value &&
    (value as Record<typeof META_OVERRIDE_SYMBOL, unknown>)[
      META_OVERRIDE_SYMBOL
    ] === true
  );
}
