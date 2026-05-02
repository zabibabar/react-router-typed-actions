/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useFetcher } from "react-router";
import type {
  ActionDefinitionRecord,
  ActionDefinition,
  ActionRegistry,
} from "./define-action";
import {
  createActionsFactory,
  type ActionObject,
  type ActionOptions,
} from "./factory";
import { deserialize, type FileEntry } from "./serialization";

// ─── Module-level singleton ──────────────────────────────────────

type Factory = ReturnType<typeof createActionsFactory>;

let _factory: Factory | null = null;
let _mountCount = 0;

function getFactory(): Factory {
  if (!_factory) {
    throw new Error(
      "react-router-actions: ActionsProvider has not been mounted. " +
        "Wrap your app in <ActionsProvider> before calling resolveFormData or createAction.",
    );
  }
  return _factory;
}

// ─── Context ─────────────────────────────────────────────────────

const ActionsContext = createContext<Factory | null>(null);

// ─── ActionsProvider ─────────────────────────────────────────────

export interface ActionsProviderProps {
  actions: ActionDefinitionRecord<any>;
  children: ReactNode;
}

export function ActionsProvider({ actions, children }: ActionsProviderProps) {
  const factory = useMemo(() => createActionsFactory(actions), [actions]);

  _factory = factory;

  useEffect(() => {
    _mountCount++;
    if (process.env.NODE_ENV !== "production" && _mountCount > 1) {
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

// ─── Derived types from ActionRegistry ───────────────────────────

type RegisteredActionType = keyof ActionRegistry;

type RegisteredPayload<K extends RegisteredActionType> =
  ActionRegistry[K] extends ActionDefinition<any, infer P, any, any>
    ? P
    : never;

type RegisteredResolveReturn<K extends RegisteredActionType> =
  ActionRegistry[K] extends ActionDefinition<any, any, infer R, any>
    ? Awaited<R>
    : never;

// ─── ActionResult ────────────────────────────────────────────────

export type ActionResult<K extends RegisteredActionType> =
  | { type: K; success: true; response: RegisteredResolveReturn<K> }
  | { type: K; success: false; error: unknown };

// ─── useAction hook ──────────────────────────────────────────────

export interface UseActionReturn<K extends RegisteredActionType> {
  submit: (payload: RegisteredPayload<K>, options?: ActionOptions) => void;
  isPending: boolean;
  data: ActionResult<K> | undefined;
  error: string | null;
  pendingPayload: RegisteredPayload<K> | null;
}

export function useAction<K extends RegisteredActionType>(
  type: K,
  hookOptions?: { action?: string },
): UseActionReturn<K> {
  const factory = useContext(ActionsContext);
  if (!factory) {
    throw new Error(
      "react-router-actions: useAction must be used within an <ActionsProvider>.",
    );
  }

  const fetcher = useFetcher<ActionResult<K>>();

  const submit = (
    payload: RegisteredPayload<K>,
    options?: ActionOptions,
  ) => {
    const { formData, method } = factory.createFormData(
      type as string,
      payload,
      options,
    );
    fetcher.submit(formData, {
      method,
      ...(hookOptions?.action ? { action: hookOptions.action } : {}),
    });
  };

  const pendingPayload = useMemo<RegisteredPayload<K> | null>(() => {
    if (!fetcher.formData) return null;
    const raw = fetcher.formData.get("payload");
    if (typeof raw !== "string") return null;
    try {
      const files: FileEntry[] = [];
      for (const [key, value] of fetcher.formData.entries()) {
        if (key.startsWith("file:") && value instanceof Blob) {
          files.push({ path: key.slice(5), file: value });
        }
      }
      return deserialize(raw, files) as RegisteredPayload<K>;
    } catch {
      return null;
    }
  }, [fetcher.formData]);

  return {
    submit,
    isPending: fetcher.state !== "idle",
    data: fetcher.data,
    error:
      fetcher.data && fetcher.data.success === false
        ? String(fetcher.data.error)
        : null,
    pendingPayload,
  };
}

// ─── Module-level functions (read from singleton) ────────────────

export function resolveFormData(formData: FormData): ActionObject {
  return getFactory().resolveFormData(formData);
}

export function createAction<K extends RegisteredActionType>(
  type: K,
  payload: RegisteredPayload<K>,
  options?: ActionOptions,
): ActionObject {
  return getFactory().createAction(type as string, payload, options);
}
