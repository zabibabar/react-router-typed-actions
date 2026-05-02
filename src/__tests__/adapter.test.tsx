// @vitest-environment happy-dom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, waitFor, cleanup } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { defineAction, buildActionModule } from "../define-action";
import {
  ActionsProvider,
  useAction,
  resolveFormData,
  createAction,
} from "../adapter";

// ─── Fixtures ────────────────────────────────────────────────────

const testAction = defineAction({
  type: "testAction",
  method: "post",
  resolve: (payload: { name: string }) => ({
    greeting: `Hello ${payload.name}`,
  }),
  successMessage: (p) => `Done: ${p.name}`,
  errorMessage: "Failed",
});

const failAction = defineAction({
  type: "failAction",
  method: "post",
  resolve: () => {
    throw new Error("Boom");
  },
  successMessage: "ok",
  errorMessage: "Something went wrong",
});

const module = buildActionModule({ testAction, failAction });

afterEach(() => {
  cleanup();
});

// ─── Test components ─────────────────────────────────────────────

function TestHookConsumer() {
  const { submit, isPending, data, error } = useAction<"testAction">(
    "testAction" as never,
  );

  return (
    <div>
      <button
        onClick={() => submit({ name: "World" } as never)}
        data-testid="submit"
      >
        Submit
      </button>
      <span data-testid="pending">{String(isPending)}</span>
      {data && <span data-testid="data">{JSON.stringify(data)}</span>}
      {error && <span data-testid="error">{error}</span>}
    </div>
  );
}

function FailHookConsumer() {
  const { submit, data, error } = useAction<"failAction">(
    "failAction" as never,
  );

  return (
    <div>
      <button
        onClick={() => submit({} as never)}
        data-testid="fail-submit"
      >
        Fail
      </button>
      {data && <span data-testid="fail-data">{JSON.stringify(data)}</span>}
      {error && <span data-testid="fail-error">{error}</span>}
    </div>
  );
}

// ─── Route action handler (user-written recipe) ─────────────────

async function routeAction({ request }: { request: Request }) {
  const formData = await request.formData();
  const actionObj = resolveFormData(formData);
  try {
    const response = await actionObj.resolve(undefined);
    return { type: actionObj.type, success: true, response };
  } catch (err) {
    return { type: actionObj.type, success: false, error: String(err) };
  }
}

// ─── Unit tests ──────────────────────────────────────────────────

describe("ActionsProvider", () => {
  it("renders children", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => (
          <ActionsProvider actions={module}>
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
      useAction<"testAction">("testAction" as never);
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

describe("singleton — before mount", () => {
  it("resolveFormData throws when singleton is not set", () => {
    expect(() => resolveFormData(new FormData())).toThrow(
      "ActionsProvider has not been mounted",
    );
  });

  it("createAction throws when singleton is not set", () => {
    expect(() =>
      createAction("testAction" as never, { name: "x" } as never),
    ).toThrow("ActionsProvider has not been mounted");
  });
});

// ─── Integration tests ──────────────────────────────────────────

describe("useAction — integration", () => {
  it("submit → action → response round-trip", async () => {
    const router = createMemoryRouter([
      {
        path: "/",
        Component: () => (
          <ActionsProvider actions={module}>
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
          <ActionsProvider actions={module}>
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
});
