import {
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useFetcher } from "react-router";
import type { Action } from "./define-action";
import type { ActionResult } from "./action-object";
import { createFormData, deserializePayload } from "./form-data";

// ─── useAction hook ──────────────────────────────────────────────

export interface UseActionOptions<TResult> {
  action?: string;
  onSuccess?: (result: TResult) => void;
  onError?: (error: unknown) => void;
}

export interface UseActionState<TResult, TPayload> {
  state: "idle" | "submitting" | "loading";
  data: ActionResult<TResult> | undefined;
  pendingPayload: TPayload | undefined;
}

export function useAction<
  TType extends string,
  TPayload,
  TResult,
  TContext,
  TMeta,
>(
  action: Action<TType, TPayload, TResult, TContext, TMeta>,
  options?: UseActionOptions<TResult>,
): [submit: (payload: TPayload, meta?: Partial<TMeta>) => void, state: UseActionState<TResult, TPayload>] {
  const fetcher = useFetcher<ActionResult<TResult>>();
  const prevDataRef = useRef<ActionResult<TResult> | undefined>(undefined);
  const submitTimestampRef = useRef<number>(0);

  const latestRef = useRef({ action, options });
  latestRef.current = { action, options };

  const submit = useCallback((payload: TPayload, meta?: Partial<TMeta>) => {
    const { action: act, options: opts } = latestRef.current;
    submitTimestampRef.current = Date.now();

    const { formData, method } = createFormData(
      act,
      payload,
      meta as Record<string, unknown> | undefined,
    );
    fetcher.submit(formData, {
      method,
      ...(opts?.action ? { action: opts.action } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
