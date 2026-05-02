/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type ReactElement,
} from "react";
import { useFetcher } from "react-router";
import type { ActionDefinition } from "./define-action";
import type { ActionCreator } from "./define-action";
import { createActionsFactory } from "./factory";
import type { ActionObject, ActionResult } from "./action-object";
import { deserialize, type FileEntry } from "./serialization";

// ─── Module-level singleton ──────────────────────────────────────

type Factory = ReturnType<typeof createActionsFactory>;

let _factory: Factory | null = null;
let _mountCount = 0;

function getFactory(): Factory {
  if (!_factory) {
    throw new Error(
      "react-router-actions: ActionsProvider has not been mounted. " +
        "Wrap your app in <ActionsProvider> before calling resolveFormData.",
    );
  }
  return _factory;
}

// ─── Context ─────────────────────────────────────────────────────

const ActionsContext = createContext<Factory | null>(null);

// ─── ActionsProvider ─────────────────────────────────────────────

export interface ActionsProviderProps {
  actions: ActionDefinition<string, any, any, any>[];
  children: ReactNode;
}

export function ActionsProvider({
  actions,
  children,
}: ActionsProviderProps): ReactElement {
  const factory = useMemo(() => createActionsFactory(actions), [actions]);

  _factory = factory;

  useEffect(() => {
    _mountCount++;
    if (process.env.NODE_ENV !== "production" && _mountCount > 2) {
      console.warn(
        "react-router-actions: ActionsProvider mounted more than once. " +
          "This may cause unexpected behavior.",
      );
    }
    return () => {
      _mountCount--;
      if (_mountCount === 0) {
        _factory = null;
      }
    };
  }, []);

  return (
    <ActionsContext.Provider value={factory}>
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
  pending: boolean;
  data: ActionResult<TResult> | undefined;
  pendingPayload: TPayload | undefined;
}

export function useAction<
  TType extends string,
  TPayload,
  TResult,
  TContext,
>(
  action: ActionCreator<TType, TPayload, TResult, TContext>,
  options?: UseActionOptions<TResult>,
): [submit: (payload: TPayload) => void, state: UseActionState<TResult, TPayload>] {
  const factory = useContext(ActionsContext);
  if (!factory) {
    throw new Error(
      "react-router-actions: useAction must be used within an <ActionsProvider>.",
    );
  }

  const fetcher = useFetcher<ActionResult<TResult>>();
  const prevDataRef = useRef<ActionResult<TResult> | undefined>(undefined);

  const submit = (payload: TPayload) => {
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

    if (data.success) {
      options?.onSuccess?.(data.response);
    } else {
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
      pending: fetcher.state !== "idle",
      data: fetcher.data,
      pendingPayload,
    },
  ];
}

// ─── Module-level functions (read from singleton) ────────────────

export function resolveFormData(formData: FormData): ActionObject<any> {
  return getFactory().resolveFormData(formData);
}
