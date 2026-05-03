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
import type { ActionCreator, ActionDefinition } from "./define-action";
import { createActionsFactory } from "./factory";
import type { ActionObject, ActionResult } from "./action-object";
import { buildActionObject } from "./action-object";
import { deserialize, serialize, type FileEntry } from "./serialization";

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

// ─── Global Registry ─────────────────────────────────────────────

const _globalRegistry = new Map<string, ActionDefinition>();

// ─── Context ─────────────────────────────────────────────────────

type Factory = ReturnType<typeof createActionsFactory>;

interface ActionsContextValue {
  factory: Factory;
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
  const factory = useMemo(() => createActionsFactory(actions), [actions]);

  const emitEvent = useCallback<ActionEventHandler>(
    (event) => {
      if (debug) defaultDebugLogger(event);
      onAction?.(event);
    },
    [debug, onAction],
  );

  const hasListeners = debug || onAction;

  useEffect(() => {
    const contributedTypes: string[] = [];

    for (const creator of actions) {
      const def = (creator as any)._definition as ActionDefinition;
      if (_globalRegistry.has(creator.type)) {
        throw new Error(
          `react-router-actions: Duplicate action type "${creator.type}" — ` +
            `already registered by another ActionsProvider.`,
        );
      }
      _globalRegistry.set(creator.type, def);
      contributedTypes.push(creator.type);
    }

    return () => {
      for (const type of contributedTypes) {
        _globalRegistry.delete(type);
      }
    };
  }, [actions]);

  const contextValue = useMemo<ActionsContextValue>(
    () => ({ factory, emitEvent: hasListeners ? emitEvent : null }),
    [factory, emitEvent, hasListeners],
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

  const { factory, emitEvent } = ctx;
  const fetcher = useFetcher<ActionResult<TResult>>();
  const prevDataRef = useRef<ActionResult<TResult> | undefined>(undefined);
  const submitTimestampRef = useRef<number>(0);

  const submit = (payload: TPayload) => {
    submitTimestampRef.current = Date.now();
    emitEvent?.({
      phase: "submit",
      type: action.type,
      name: action.name,
      payload,
      timestamp: submitTimestampRef.current,
    });

    const { formData, method } = factory.createFormData(
      action.type,
      payload,
    );
    fetcher.submit(formData, {
      method,
      ...(options?.action ? { action: options.action } : {}),
    });
  };

  useEffect(() => {
    const data = fetcher.data;
    if (data === undefined || data === prevDataRef.current) return;
    prevDataRef.current = data;

    const duration = submitTimestampRef.current
      ? Date.now() - submitTimestampRef.current
      : 0;
    const timestamp = Date.now();

    if (data.success) {
      emitEvent?.({
        phase: "success",
        type: action.type,
        name: action.name,
        result: data.response,
        duration,
        timestamp,
      });
      options?.onSuccess?.(data.response);
    } else {
      emitEvent?.({
        phase: "error",
        type: action.type,
        name: action.name,
        error: data.error,
        duration,
        timestamp,
      });
      options?.onError?.(data.error);
    }
  }, [fetcher.data]);

  const pendingPayload = useMemo<TPayload | undefined>(() => {
    if (!fetcher.formData) return undefined;
    const raw = fetcher.formData.get("payload");
    if (typeof raw !== "string") return undefined;
    try {
      const files: FileEntry[] = [];
      for (const [key, value] of fetcher.formData.entries()) {
        if (key.startsWith("file:") && value instanceof Blob) {
          files.push({ path: key.slice(5), file: value });
        }
      }
      return deserialize(raw, files) as TPayload;
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

// ─── Module-level resolveFormData (reads from global registry) ───

export function resolveFormData(formData: FormData): ActionObject<any, any> {
  const actionType = formData.get("actionType");
  const encodedPayload = formData.get("payload");

  if (
    typeof actionType !== "string" ||
    typeof encodedPayload !== "string"
  ) {
    throw new Error(
      "react-router-actions: Invalid FormData — missing actionType or payload.",
    );
  }

  const def = _globalRegistry.get(actionType);
  if (!def) {
    throw new Error(
      `react-router-actions: Unknown action type "${actionType}". ` +
        "Ensure an ActionsProvider registering this action is mounted.",
    );
  }

  const files: FileEntry[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("file:") && value instanceof Blob) {
      files.push({ path: key.slice(5), file: value });
    }
  }

  const payload = deserialize(encodedPayload, files);
  return buildActionObject(def, payload);
}
