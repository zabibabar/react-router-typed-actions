// @vitest-environment happy-dom

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor, cleanup } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { defineAction } from "../define-action";
import { useActionFetcher } from "../use-action-fetcher";
import { resolveFormData } from "../form-data";
import { registerActions, _resetRegistryForTesting } from "../registry";
import { actionSuccess, actionFailure } from "../action-object";

// ─── Fixtures ────────────────────────────────────────────────────

const testAction = defineAction({
  type: "testAction",
  resolve: (payload: { name: string }) => ({
    greeting: `Hello ${payload.name}`,
  }),
});

const failAction = defineAction({
  type: "failAction",
  resolve: () => {
    throw new Error("Boom");
  },
});

const failWithStringAction = defineAction({
  type: "failWithStringAction",
  resolve: () => {
    throw "boom-string";
  },
});

interface NotifyMeta {
  successMessage: string;
  errorMessage: string;
}

const metaAction = defineAction<
  "metaAction",
  { name: string },
  { greeting: string },
  void,
  NotifyMeta
>({
  type: "metaAction",
  resolve: (payload) => ({ greeting: `Hello ${payload.name}` }),
  meta: {
    successMessage: "Default success",
    errorMessage: "Default error",
  },
});

beforeEach(() => {
  registerActions([testAction, failAction, failWithStringAction, metaAction]);
});

afterEach(() => {
  cleanup();
  _resetRegistryForTesting();
});

// ─── Route action handlers ───────────────────────────────────────

async function routeAction({ request }: { request: Request }) {
  const formData = await request.formData();
  const actionObj = resolveFormData(formData);
  try {
    const response = await actionObj.resolve();
    return actionSuccess(actionObj, response);
  } catch (err) {
    return actionFailure(actionObj, String(err));
  }
}

async function metaRouteAction({ request }: { request: Request }) {
  const formData = await request.formData();
  const actionObj = resolveFormData(formData);
  try {
    const response = await actionObj.resolve();
    return { ...actionSuccess(actionObj, response), meta: actionObj.meta };
  } catch (err) {
    return { ...actionFailure(actionObj, String(err)), meta: actionObj.meta };
  }
}

// ─── Test components ─────────────────────────────────────────────

function TestHookConsumer({
  onSuccess,
  onError,
}: {
  onSuccess?: (result: { greeting: string }) => void;
  onError?: (error: unknown) => void;
}) {
  const [submit, { state, data }] = useActionFetcher(testAction, {
    onSuccess,
    onError,
  });

  return (
    <div>
      <button onClick={() => submit({ name: "World" })} data-testid="submit">
        Submit
      </button>
      <span data-testid="state">{state}</span>
      {data && <span data-testid="data">{JSON.stringify(data)}</span>}
    </div>
  );
}

function FailHookConsumer({ onError }: { onError?: (error: unknown) => void }) {
  const [submit, { data }] = useActionFetcher(failAction, { onError });

  return (
    <div>
      <button
        onClick={() => submit(undefined as never)}
        data-testid="fail-submit"
      >
        Fail
      </button>
      {data && <span data-testid="fail-data">{JSON.stringify(data)}</span>}
    </div>
  );
}

function FailStringHookConsumer({
  onError,
}: {
  onError?: (error: unknown) => void;
}) {
  const [submit, { data }] = useActionFetcher(failWithStringAction, { onError });

  return (
    <div>
      <button
        onClick={() => submit(undefined as never)}
        data-testid="fail-string-submit"
      >
        Fail string
      </button>
      {data && <span data-testid="fail-string-data">{JSON.stringify(data)}</span>}
    </div>
  );
}

// ─── useActionFetcher — no provider needed ─────────────────────────────

describe("useActionFetcher — standalone (no provider)", () => {
  it("does not throw when used without a provider", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => {
          useActionFetcher(testAction);
          return <span data-testid="ok">ok</span>;
        },
      },
    ]);

    render(<RouterProvider router={router} />);
    expect(screen.getByTestId("ok").textContent).toBe("ok");
  });
});

// ─── Integration tests ──────────────────────────────────────────

describe("useActionFetcher — integration", () => {
  it("returns a tuple of [submit, state]", () => {
    let tupleResult: unknown;

    function Inspector() {
      const result = useActionFetcher(testAction);
      tupleResult = result;
      return null;
    }

    const router = createMemoryRouter([
      {
        path: "/",
        Component: Inspector,
      },
    ]);

    render(<RouterProvider router={router} />);
    expect(Array.isArray(tupleResult)).toBe(true);
    const [submit, state] = tupleResult as [unknown, unknown];
    expect(typeof submit).toBe("function");
    expect(state).toHaveProperty("state");
    expect(state).toHaveProperty("data");
    expect(state).toHaveProperty("pendingPayload");
  });

  it("submit function is referentially stable across re-renders", async () => {
    const submitRefs: Function[] = [];

    function Inspector() {
      const [submit] = useActionFetcher(testAction);
      submitRefs.push(submit);
      return <span data-testid="count">{submitRefs.length}</span>;
    }

    let forceRender: () => void;

    function Wrapper() {
      const [, setState] = React.useState(0);
      forceRender = () => setState((n) => n + 1);
      return <Inspector />;
    }

    const router = createMemoryRouter([{ path: "/", Component: Wrapper }]);

    render(<RouterProvider router={router} />);

    await act(async () => {
      forceRender!();
    });

    await act(async () => {
      forceRender!();
    });

    expect(submitRefs.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < submitRefs.length; i++) {
      expect(submitRefs[i]).toBe(submitRefs[0]);
    }
  });

  it("state is 'idle' initially", () => {
    let capturedState: string | undefined;

    function Inspector() {
      const [, { state }] = useActionFetcher(testAction);
      capturedState = state;
      return null;
    }

    const router = createMemoryRouter([
      {
        path: "/",
        Component: Inspector,
      },
    ]);

    render(<RouterProvider router={router} />);
    expect(capturedState).toBe("idle");
  });

  it("submit → action → response round-trip", async () => {
    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => <TestHookConsumer />,
        action: routeAction,
      },
    ]);

    render(<RouterProvider router={router} />);

    await act(async () => {
      screen.getByTestId("submit").click();
    });

    await waitFor(() => {
      const dataEl = screen.getByTestId("data");
      const data = JSON.parse(dataEl.textContent!);
      expect(data.success).toBe(true);
      expect(data.response).toEqual({ greeting: "Hello World" });
      expect(data.type).toBe("testAction");
    });
  });

  it("error path returns success:false with error", async () => {
    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => <FailHookConsumer />,
        action: routeAction,
      },
    ]);

    render(<RouterProvider router={router} />);

    await act(async () => {
      screen.getByTestId("fail-submit").click();
    });

    await waitFor(() => {
      const dataEl = screen.getByTestId("fail-data");
      const data = JSON.parse(dataEl.textContent!);
      expect(data.success).toBe(false);
      expect(data.type).toBe("failAction");
    });
  });

  it("onSuccess fires with unwrapped result", async () => {
    const onSuccess = vi.fn();

    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => <TestHookConsumer onSuccess={onSuccess} />,
        action: routeAction,
      },
    ]);

    render(<RouterProvider router={router} />);

    await act(async () => {
      screen.getByTestId("submit").click();
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({ greeting: "Hello World" });
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it("onError fires with error on failure", async () => {
    const onError = vi.fn();

    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => <FailHookConsumer onError={onError} />,
        action: routeAction,
      },
    ]);

    render(<RouterProvider router={router} />);

    await act(async () => {
      screen.getByTestId("fail-submit").click();
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.stringContaining("Boom"));
    });
  });

  it("onError preserves non-Error throwables", async () => {
    const onError = vi.fn();

    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => <FailStringHookConsumer onError={onError} />,
        action: routeAction,
      },
    ]);

    render(<RouterProvider router={router} />);

    await act(async () => {
      screen.getByTestId("fail-string-submit").click();
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith("boom-string");
    });
  });
});

// ─── pendingPayload tests ───────────────────────────────────────

describe("pendingPayload", () => {
  it("is undefined when idle", () => {
    let capturedPending: unknown;

    function Inspector() {
      const [, { pendingPayload }] = useActionFetcher(testAction);
      capturedPending = pendingPayload;
      return null;
    }

    const router = createMemoryRouter([
      {
        path: "/",
        Component: Inspector,
      },
    ]);

    render(<RouterProvider router={router} />);
    expect(capturedPending).toBeUndefined();
  });

  it("contains the submitted payload during submission and clears after settlement", async () => {
    const pendingSnapshots: unknown[] = [];

    function Inspector() {
      const [submit, { pendingPayload, data }] = useActionFetcher(testAction);
      pendingSnapshots.push(pendingPayload);
      return (
        <div>
          <button
            onClick={() => submit({ name: "Pending" })}
            data-testid="submit"
          >
            Submit
          </button>
          {data && <span data-testid="done">done</span>}
        </div>
      );
    }

    const router = createMemoryRouter([
      {
        path: "/",
        Component: Inspector,
        action: routeAction,
      },
    ]);

    render(<RouterProvider router={router} />);

    await act(async () => {
      screen.getByTestId("submit").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("done")).toBeTruthy();
    });

    const hadPending = pendingSnapshots.some(
      (p) => p !== undefined && (p as { name: string }).name === "Pending",
    );
    expect(hadPending).toBe(true);

    const lastSnapshot = pendingSnapshots[pendingSnapshots.length - 1];
    expect(lastSnapshot).toBeUndefined();
  });
});

// ─── submit with meta overrides ─────────────────────────────────

describe("useActionFetcher — meta overrides on submit", () => {
  it("passes submit-time meta overrides through to the route action", async () => {
    function MetaConsumer() {
      const [submit, { data }] = useActionFetcher(metaAction);
      return (
        <div>
          <button
            onClick={() =>
              submit({ name: "World" }, { successMessage: "Custom toast!" })
            }
            data-testid="meta-submit"
          >
            Submit
          </button>
          {data && <span data-testid="meta-data">{JSON.stringify(data)}</span>}
        </div>
      );
    }

    const router = createMemoryRouter([
      {
        path: "/",
        Component: MetaConsumer,
        action: metaRouteAction,
      },
    ]);

    render(<RouterProvider router={router} />);

    await act(async () => {
      screen.getByTestId("meta-submit").click();
    });

    await waitFor(() => {
      const dataEl = screen.getByTestId("meta-data");
      const data = JSON.parse(dataEl.textContent!);
      expect(data.success).toBe(true);
      expect(data.response).toEqual({ greeting: "Hello World" });
      expect(data.meta).toEqual({
        successMessage: "Custom toast!",
        errorMessage: "Default error",
      });
    });
  });

  it("preserves static meta when no overrides are provided", async () => {
    function MetaConsumer() {
      const [submit, { data }] = useActionFetcher(metaAction);
      return (
        <div>
          <button
            onClick={() => submit({ name: "World" })}
            data-testid="meta-submit"
          >
            Submit
          </button>
          {data && <span data-testid="meta-data">{JSON.stringify(data)}</span>}
        </div>
      );
    }

    const router = createMemoryRouter([
      {
        path: "/",
        Component: MetaConsumer,
        action: metaRouteAction,
      },
    ]);

    render(<RouterProvider router={router} />);

    await act(async () => {
      screen.getByTestId("meta-submit").click();
    });

    await waitFor(() => {
      const dataEl = screen.getByTestId("meta-data");
      const data = JSON.parse(dataEl.textContent!);
      expect(data.meta).toEqual({
        successMessage: "Default success",
        errorMessage: "Default error",
      });
    });
  });
});

// ─── concurrent / rapid submissions ─────────────────────────────

describe("useActionFetcher — concurrent submissions", () => {
  it("only the final submission triggers onSuccess", async () => {
    const onSuccess = vi.fn();

    function RapidConsumer() {
      const [submit, { data }] = useActionFetcher(testAction, { onSuccess });
      return (
        <div>
          <button
            onClick={() => {
              submit({ name: "First" });
              submit({ name: "Second" });
            }}
            data-testid="rapid-submit"
          >
            Submit twice
          </button>
          {data && <span data-testid="rapid-data">{JSON.stringify(data)}</span>}
        </div>
      );
    }

    const router = createMemoryRouter([
      {
        path: "/",
        Component: RapidConsumer,
        action: routeAction,
      },
    ]);

    render(<RouterProvider router={router} />);

    await act(async () => {
      screen.getByTestId("rapid-submit").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("rapid-data")).toBeTruthy();
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({ greeting: "Hello Second" });
  });

  it("pendingPayload reflects the latest submission", async () => {
    const pendingSnapshots: unknown[] = [];

    function RapidConsumer() {
      const [submit, { pendingPayload, data }] = useActionFetcher(testAction);
      pendingSnapshots.push(pendingPayload);
      return (
        <div>
          <button
            onClick={() => {
              submit({ name: "First" });
              submit({ name: "Second" });
            }}
            data-testid="rapid-submit"
          >
            Submit twice
          </button>
          {data && <span data-testid="rapid-done">done</span>}
        </div>
      );
    }

    const router = createMemoryRouter([
      {
        path: "/",
        Component: RapidConsumer,
        action: routeAction,
      },
    ]);

    render(<RouterProvider router={router} />);

    await act(async () => {
      screen.getByTestId("rapid-submit").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("rapid-done")).toBeTruthy();
    });

    const pendingWithPayload = pendingSnapshots.filter(
      (p): p is { name: string } => p !== undefined && p !== null,
    );
    if (pendingWithPayload.length > 0) {
      const lastPending = pendingWithPayload[pendingWithPayload.length - 1];
      expect(lastPending.name).toBe("Second");
    }
  });
});
