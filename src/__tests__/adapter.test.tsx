// @vitest-environment happy-dom

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor, cleanup } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { defineAction } from "../define-action";
import { useAction } from "../adapter";
import { resolveFormData } from "../form-data";
import { registerSlice, _resetRegistryForTesting } from "../registry";
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

beforeEach(() => {
  registerSlice("adapter-test", [testAction, failAction]);
});

afterEach(() => {
  cleanup();
  _resetRegistryForTesting();
});

// ─── Route action handler (user-written recipe) ─────────────────

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

// ─── Test components ─────────────────────────────────────────────

function TestHookConsumer({
  onSuccess,
  onError,
}: {
  onSuccess?: (result: { greeting: string }) => void;
  onError?: (error: unknown) => void;
}) {
  const [submit, { state, data }] = useAction(testAction, {
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
  const [submit, { data }] = useAction(failAction, { onError });

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

// ─── useAction — no provider needed ─────────────────────────────

describe("useAction — standalone (no provider)", () => {
  it("does not throw when used without a provider", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => {
          useAction(testAction);
          return <span data-testid="ok">ok</span>;
        },
      },
    ]);

    render(<RouterProvider router={router} />);
    expect(screen.getByTestId("ok").textContent).toBe("ok");
  });
});

// ─── Integration tests ──────────────────────────────────────────

describe("useAction — integration", () => {
  it("returns a tuple of [submit, state]", () => {
    let tupleResult: unknown;

    function Inspector() {
      const result = useAction(testAction);
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
      const [submit] = useAction(testAction);
      submitRefs.push(submit);
      return <span data-testid="count">{submitRefs.length}</span>;
    }

    let forceRender: () => void;

    function Wrapper() {
      const [, setState] = React.useState(0);
      forceRender = () => setState((n) => n + 1);
      return <Inspector />;
    }

    const router = createMemoryRouter([
      { path: "/", Component: Wrapper },
    ]);

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
      const [, { state }] = useAction(testAction);
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
});

// ─── pendingPayload tests ───────────────────────────────────────

describe("pendingPayload", () => {
  it("is undefined when idle", () => {
    let capturedPending: unknown;

    function Inspector() {
      const [, { pendingPayload }] = useAction(testAction);
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
      const [submit, { pendingPayload, data }] = useAction(testAction);
      pendingSnapshots.push(pendingPayload);
      return (
        <div>
          <button onClick={() => submit({ name: "Pending" })} data-testid="submit">
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
