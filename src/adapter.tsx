/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  type ReactNode,
  type ReactElement,
} from "react";
import { useFetcher } from "react-router";
import type { ActionCreator } from "./define-action";
import type { ActionResult } from "./action-object";
import { registerActions, unregisterActions } from "./registry";
import { createFormData, deserializePayload } from "./form-data";

// ─── Action Events ───────────────────────────────────────────────

export type ActionEvent =
  | { phase: "submit"; type: string; name: string; payload: unknown; timestamp: number }
  | { phase: "success"; type: string; name: string; result: unknown; duration: number; timestamp: number }
  | { phase: "error"; type: string; name: string; error: unknown; duration: number; timestamp: number };

export type ActionEventHandler = (event: ActionEvent) => void;

function defaultDebugLogger(event: ActionEvent): void {
  const tag = "react-router-actions";
  switch (event.phase) {
    case "submit":
      console.groupCollapsed(`[${tag}] ▶ ${event.name}`);
      console.log("type:", event.type);
      console.log("payload:", event.payload);
      console.groupEnd();
      break;
    case "success":
      console.groupCollapsed(`[${tag}] ✓ ${event.name} (${event.duration}ms)`);
      console.log("type:", event.type);
      console.log("result:", event.result);
      console.groupEnd();
      break;
    case "error":
      console.groupCollapsed(`[${tag}] ✗ ${event.name} (${event.duration}ms)`);
      console.log("type:", event.type);
      console.log("error:", event.error);
      console.groupEnd();
      break;
  }
}

// ─── Context ─────────────────────────────────────────────────────

interface ActionsContextValue {
  emitEvent: ActionEventHandler | null;
}

const ActionsContext = createContext<ActionsContextValue | null>(null);

// ─── ActionsProvider ─────────────────────────────────────────────

export interface ActionsProviderProps {
  actions: ActionCreator<string, any, any, any, any>[];
  debug?: boolean;
  onAction?: ActionEventHandler;
  children: ReactNode;
}

export function ActionsProvider({
  actions,
  debug = false,
  onAction,
  children,
}: ActionsProviderProps): ReactElement {
  const emitEvent = useCallback<ActionEventHandler>(
    (event) => {
      if (debug) defaultDebugLogger(event);
      onAction?.(event);
    },
    [debug, onAction],
  );

  const hasListeners = debug || !!onAction;

  const typeKey = useMemo(
    () => actions.map((a) => a.type).sort().join("\0"),
    [actions],
  );

  useEffect(() => {
    const contributedTypes = registerActions(actions);
    return () => {
      unregisterActions(contributedTypes);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeKey]);

  const contextValue = useMemo<ActionsContextValue>(
    () => ({ emitEvent: hasListeners ? emitEvent : null }),
    [emitEvent, hasListeners],
  );

  return (
    <ActionsContext.Provider value={contextValue}>
      {children}
    </ActionsContext.Provider>
  );
}

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
  action: ActionCreator<TType, TPayload, TResult, TContext, TMeta>,
  options?: UseActionOptions<TResult>,
): [submit: (payload: TPayload) => void, state: UseActionState<TResult, TPayload>] {
  const ctx = useContext(ActionsContext);
  if (!ctx) {
    throw new Error(
      "react-router-actions: useAction must be used within an <ActionsProvider>.",
    );
  }

  const { emitEvent } = ctx;
  const fetcher = useFetcher<ActionResult<TResult>>();
  const prevDataRef = useRef<ActionResult<TResult> | undefined>(undefined);
  const submitTimestampRef = useRef<number>(0);

  const latestRef = useRef({ emitEvent, action, options });
  latestRef.current = { emitEvent, action, options };

  const submit = useCallback((payload: TPayload) => {
    const { emitEvent: emit, action: act, options: opts } = latestRef.current;
    submitTimestampRef.current = Date.now();
    emit?.({
      phase: "submit",
      type: act.type,
      name: act.name,
      payload,
      timestamp: submitTimestampRef.current,
    });

    const { formData, method } = createFormData(act.type, payload);
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

    const { emitEvent: emit, action: act, options: opts } = latestRef.current;

    const duration = submitTimestampRef.current
      ? Date.now() - submitTimestampRef.current
      : 0;
    const timestamp = Date.now();

    if (data.success) {
      emit?.({
        phase: "success",
        type: act.type,
        name: act.name,
        result: data.response,
        duration,
        timestamp,
      });
      opts?.onSuccess?.(data.response);
    } else {
      emit?.({
        phase: "error",
        type: act.type,
        name: act.name,
        error: data.error,
        duration,
        timestamp,
      });
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
