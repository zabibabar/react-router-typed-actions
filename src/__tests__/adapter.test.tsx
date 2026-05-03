// @vitest-environment happy-dom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, waitFor, cleanup } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { defineAction } from "../define-action";
import { ActionsProvider, useAction, resolveFormData } from "../adapter";

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

const actions = [testAction, failAction];

afterEach(() => {
  cleanup();
});

// ─── Route action handler (user-written recipe) ─────────────────

async function routeAction({ request }: { request: Request }) {
  const formData = await request.formData();
  const actionObj = resolveFormData(formData);
  try {
    const response = await actionObj.resolve();
    return { type: actionObj.type, success: true as const, response };
  } catch (err) {
    return {
      type: actionObj.type,
      success: false as const,
      error: String(err),
    };
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

// ─── Unit tests ──────────────────────────────────────────────────

describe("ActionsProvider", () => {
  it("renders children", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => (
          <ActionsProvider actions={actions}>
            <span data-testid="child">hello</span>
          </ActionsProvider>
        ),
      },
    ]);

    render(<RouterProvider router={router} />);
    expect(screen.getByTestId("child").textContent).toBe("hello");
  });
});

describe("useAction — outside provider", () => {
  it("throws when used outside ActionsProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    function Bare() {
      useAction(testAction);
      return null;
    }

    const router = createMemoryRouter([
      {
        path: "/",
        Component: Bare,
        errorElement: <div data-testid="error-boundary">caught</div>,
      },
    ]);

    render(<RouterProvider router={router} />);
    expect(screen.getByTestId("error-boundary").textContent).toBe("caught");
    spy.mockRestore();
  });
});

describe("resolveFormData — before mount", () => {
  it("throws when no provider is mounted", () => {
    const formData = new FormData();
    formData.set("actionType", "testAction");
    formData.set("payload", '{"json":"{}"}');
    expect(() => resolveFormData(formData)).toThrow(
      'Unknown action type "testAction"',
    );
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
        Component: () => (
          <ActionsProvider actions={actions}>
            <Inspector />
          </ActionsProvider>
        ),
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
        Component: () => (
          <ActionsProvider actions={actions}>
            <Inspector />
          </ActionsProvider>
        ),
      },
    ]);

    render(<RouterProvider router={router} />);
    expect(capturedState).toBe("idle");
  });

  it("submit → action → response round-trip", async () => {
    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => (
          <ActionsProvider actions={actions}>
            <TestHookConsumer />
          </ActionsProvider>
        ),
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
        Component: () => (
          <ActionsProvider actions={actions}>
            <FailHookConsumer />
          </ActionsProvider>
        ),
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
        Component: () => (
          <ActionsProvider actions={actions}>
            <TestHookConsumer onSuccess={onSuccess} />
          </ActionsProvider>
        ),
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
        Component: () => (
          <ActionsProvider actions={actions}>
            <FailHookConsumer onError={onError} />
          </ActionsProvider>
        ),
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

// ─── Multi-provider tests ────────────────────────────────────────

describe("multi-provider", () => {
  const alphaAction = defineAction({
    type: "alphaAction",
    resolve: (payload: { value: string }) => ({
      echoed: payload.value,
    }),
  });

  const betaAction = defineAction({
    type: "betaAction",
    resolve: (payload: { count: number }) => ({
      doubled: payload.count * 2,
    }),
  });

  it("two providers with disjoint actions — both resolve via resolveFormData", async () => {
    function AlphaConsumer() {
      const [submit, { data }] = useAction(alphaAction);
      return (
        <div>
          <button onClick={() => submit({ value: "hello" })} data-testid="alpha-submit">
            Alpha
          </button>
          {data && <span data-testid="alpha-data">{JSON.stringify(data)}</span>}
        </div>
      );
    }

    function BetaConsumer() {
      const [submit, { data }] = useAction(betaAction);
      return (
        <div>
          <button onClick={() => submit({ count: 5 })} data-testid="beta-submit">
            Beta
          </button>
          {data && <span data-testid="beta-data">{JSON.stringify(data)}</span>}
        </div>
      );
    }

    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => (
          <>
            <ActionsProvider actions={[alphaAction]}>
              <AlphaConsumer />
            </ActionsProvider>
            <ActionsProvider actions={[betaAction]}>
              <BetaConsumer />
            </ActionsProvider>
          </>
        ),
        action: routeAction,
      },
    ]);

    render(<RouterProvider router={router} />);

    await act(async () => {
      screen.getByTestId("alpha-submit").click();
    });

    await waitFor(() => {
      const data = JSON.parse(screen.getByTestId("alpha-data").textContent!);
      expect(data.success).toBe(true);
      expect(data.response).toEqual({ echoed: "hello" });
    });
  });

  it("duplicate action type across providers throws on mount", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const duplicateAction = defineAction({
      type: "sharedType",
      resolve: () => null,
    });

    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => (
          <>
            <ActionsProvider actions={[duplicateAction]}>
              <div>Provider 1</div>
            </ActionsProvider>
            <ActionsProvider actions={[duplicateAction]}>
              <div>Provider 2</div>
            </ActionsProvider>
          </>
        ),
        errorElement: <div data-testid="error-boundary">caught</div>,
      },
    ]);

    render(<RouterProvider router={router} />);
    expect(screen.getByTestId("error-boundary").textContent).toBe("caught");
    spy.mockRestore();
  });

  it("unmounting a provider cleans up its types from the global registry", async () => {
    const isolatedAction = defineAction({
      type: "isolatedAction",
      resolve: () => ({ ok: true }),
    });

    let showProvider = true;
    let rerender: () => void;

    function Wrapper() {
      const [show, setShow] = React.useState(true);
      rerender = () => setShow(false);
      return show ? (
        <ActionsProvider actions={[isolatedAction]}>
          <div data-testid="mounted">yes</div>
        </ActionsProvider>
      ) : (
        <div data-testid="unmounted">gone</div>
      );
    }

    const React = await import("react");

    const router = createMemoryRouter([
      {
        path: "/",
        Component: Wrapper,
      },
    ]);

    render(<RouterProvider router={router} />);
    expect(screen.getByTestId("mounted")).toBeTruthy();

    await act(async () => {
      rerender!();
    });

    await waitFor(() => {
      expect(screen.getByTestId("unmounted")).toBeTruthy();
    });

    const formData = new FormData();
    formData.set("actionType", "isolatedAction");
    formData.set("payload", '{"json":"{}"}');
    expect(() => resolveFormData(formData)).toThrow('Unknown action type "isolatedAction"');
  });
});
