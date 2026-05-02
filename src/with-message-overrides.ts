const MESSAGE_OVERRIDE_SYMBOL: unique symbol = Symbol.for(
  "react-router-actions:message-override",
);

export interface MessageOverrides {
  successMessage?: string;
  errorMessage?: string;
}

export interface MessageOverrideResult<T> {
  readonly [MESSAGE_OVERRIDE_SYMBOL]: true;
  readonly data: T;
  readonly overrides: MessageOverrides;
}

export function withMessageOverrides<T>(
  data: T,
  overrides: MessageOverrides,
): MessageOverrideResult<T> {
  return {
    [MESSAGE_OVERRIDE_SYMBOL]: true,
    data,
    overrides,
  };
}

export function isMessageOverride(
  value: unknown,
): value is MessageOverrideResult<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    MESSAGE_OVERRIDE_SYMBOL in value &&
    (value as Record<typeof MESSAGE_OVERRIDE_SYMBOL, unknown>)[
      MESSAGE_OVERRIDE_SYMBOL
    ] === true
  );
}
