import { useEffect, useMemo, useRef, useCallback } from "react";
import { useFetcher, FetcherSubmitOptions } from "react-router";
import type { Action } from "./define-action";
import type { ActionResult } from "./action-object";
import { createFormData, deserializePayload } from "./form-data";

// ─── useAction hook ──────────────────────────────────────────────
export interface UseActionOptions<TResult> {
  fetcherOptions?: FetcherSubmitOptions;
  onSuccess?: (result: TResult) => void;
  onError?: (error: unknown) => void;
}

export interface UseActionState<
  TType extends string,
  TPayload,
  TResult,
  TContext,
  TMeta,
> {
  state: "idle" | "submitting" | "loading";
  data:
    | ActionResult<Action<TType, TPayload, TResult, TContext, TMeta>>
    | undefined;
  pendingPayload: TPayload | undefined;
}

export function useSubmitAction<
  TType extends string,
  TPayload,
  TResult,
  TContext,
  TMeta,
>(
  action: Action<TType, TPayload, TResult, TContext, TMeta>,
  options?: UseActionOptions<TResult>,
): [
  submit: (payload: TPayload, meta?: Partial<TMeta>) => void,
  state: UseActionState<TType, TPayload, TResult, TContext, TMeta>,
] {
  type Result = ActionResult<Action<TType, TPayload, TResult, TContext, TMeta>>;
  const fetcher = useFetcher<Result>();
  const prevDataRef = useRef<Result | undefined>(undefined);

  const latestRef = useRef({ action, options });
  latestRef.current = { action, options };

  const submit = useCallback((payload: TPayload, meta?: Partial<TMeta>) => {
    const { action: act, options: opts } = latestRef.current;

    const { formData, method } = createFormData(
      act,
      payload,
      meta as Record<string, unknown> | undefined,
    );
    fetcher.submit(formData, {
      ...opts?.fetcherOptions,
      method,
    });
  }, []);

  useEffect(() => {
    const data = fetcher.data;
    if (data === undefined || data === prevDataRef.current) return;
    prevDataRef.current = data;

    const { options: opts } = latestRef.current;

    if (data.success) {
      opts?.onSuccess?.(data.response);
    } else {
      opts?.onError?.(data.error);
    }
  }, [fetcher.data]);

  const pendingPayload = useMemo<TPayload | undefined>(() => {
    if (!fetcher.formData) return undefined;
    try {
      return deserializePayload(fetcher.formData) as TPayload;
    } catch {
      return undefined;
    }
  }, [fetcher.formData]);

  return [
    submit,
    {
      state: fetcher.state,
      data: fetcher.data,
      pendingPayload,
    },
  ];
}
