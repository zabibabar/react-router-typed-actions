import type { HTMLFormMethod } from "react-router";

type BaseClientActionOptionsBase = {
  successMessageOverride?: string;
  errorMessageOverride?: string;
};

export type BaseClientActionOptions =
  | (BaseClientActionOptionsBase & {
      showLoadingToast: true;
      loadingMessage?: string;
    })
  | (BaseClientActionOptionsBase & {
      showLoadingToast?: false;
    });

export abstract class BaseClientAction<T> {
  abstract readonly type: string;
  abstract readonly method: HTMLFormMethod;
  abstract resolve(token: string): unknown;

  protected abstract get defaultSuccessMessage(): string;
  protected abstract get defaultErrorMessage(): string;

  constructor(
    public readonly payload: T,
    public readonly options: BaseClientActionOptions = {},
  ) {}

  get successMessage(): string {
    return this.options.successMessageOverride ?? this.defaultSuccessMessage;
  }

  get errorMessage(): string {
    return this.options.errorMessageOverride ?? this.defaultErrorMessage;
  }
}
