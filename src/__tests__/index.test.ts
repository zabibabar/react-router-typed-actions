import { describe, it, expect, vi } from "vitest";
import {
  BaseClientAction,
  buildActionModule,
  createActionsFactory,
  createActionHandler,
  type BaseClientActionOptions,
  type InferActions,
  type InferPayloadMap,
  type InferClassMap,
  type ActionHandlerReturn,
} from "../index";

// ─── Test fixtures ───────────────────────────────────────────────

interface CreateItemPayload {
  title: string;
}

class CreateItemAction extends BaseClientAction<CreateItemPayload> {
  readonly type = "createItem";
  readonly method = "POST";
  protected get defaultSuccessMessage() {
    return `Item "${this.payload.title}" created`;
  }
  protected get defaultErrorMessage() {
    return `Failed to create item "${this.payload.title}"`;
  }
  resolve(_token: string) {
    return Promise.resolve({ id: "123", title: this.payload.title });
  }
}

interface DeleteItemPayload {
  id: string;
}

class DeleteItemAction extends BaseClientAction<DeleteItemPayload> {
  readonly type = "deleteItem";
  readonly method = "DELETE";
  protected get defaultSuccessMessage() {
    return `Item ${this.payload.id} deleted`;
  }
  protected get defaultErrorMessage() {
    return `Failed to delete item ${this.payload.id}`;
  }
  resolve(_token: string) {
    return Promise.resolve({ deleted: true });
  }
}

const actionConstructorMap = buildActionModule({
  createItem: CreateItemAction,
  deleteItem: DeleteItemAction,
});

const { ActionsFactory, createAction } = createActionsFactory(actionConstructorMap);

// ─── Tests ───────────────────────────────────────────────────────

describe("BaseClientAction", () => {
  it("uses default messages when no overrides are given", () => {
    const action = new CreateItemAction({ title: "Test" });
    expect(action.successMessage).toBe('Item "Test" created');
    expect(action.errorMessage).toBe('Failed to create item "Test"');
  });

  it("uses overridden messages when provided", () => {
    const action = new CreateItemAction(
      { title: "Test" },
      { successMessageOverride: "Custom success", errorMessageOverride: "Custom error" },
    );
    expect(action.successMessage).toBe("Custom success");
    expect(action.errorMessage).toBe("Custom error");
  });

  it("exposes payload and options", () => {
    const opts: BaseClientActionOptions = { showLoadingToast: true, loadingMessage: "Working..." };
    const action = new CreateItemAction({ title: "Test" }, opts);
    expect(action.payload).toEqual({ title: "Test" });
    expect(action.options).toEqual(opts);
  });
});

describe("buildActionModule", () => {
  it("returns the same constructor map passed in", () => {
    const map = buildActionModule({ createItem: CreateItemAction });
    expect(map.createItem).toBe(CreateItemAction);
  });
});

describe("createAction", () => {
  it("creates an instance of the correct action class", () => {
    const action = createAction("createItem", { title: "Hello" });
    expect(action).toBeInstanceOf(CreateItemAction);
    expect(action.type).toBe("createItem");
    expect(action.payload.title).toBe("Hello");
  });

  it("throws for an invalid action type", () => {
    expect(() => createAction("nonExistent" as never, {} as never)).toThrow("Invalid action type");
  });
});

describe("ActionsFactory.createFormData", () => {
  it("returns FormData with actionType, payload, and options", () => {
    const { formData, method } = ActionsFactory.createFormData("createItem", { title: "Test" });

    expect(method).toBe("POST");
    expect(formData.get("actionType")).toBe("createItem");
    expect(JSON.parse(formData.get("payload") as string)).toEqual({ title: "Test" });
    expect(JSON.parse(formData.get("options") as string)).toEqual({});
  });

  it("serializes options into FormData", () => {
    const { formData } = ActionsFactory.createFormData("deleteItem", { id: "42" }, {
      successMessageOverride: "Gone!",
    });

    const opts = JSON.parse(formData.get("options") as string);
    expect(opts.successMessageOverride).toBe("Gone!");
  });
});

describe("ActionsFactory.resolveFormData", () => {
  it("round-trips through createFormData → resolveFormData", () => {
    const { formData } = ActionsFactory.createFormData("deleteItem", { id: "99" });
    const action = ActionsFactory.resolveFormData(formData);

    expect(action).toBeInstanceOf(DeleteItemAction);
    expect(action.type).toBe("deleteItem");
    expect(action.payload).toEqual({ id: "99" });
  });

  it("throws if actionType is missing", () => {
    const formData = new FormData();
    formData.append("payload", "{}");
    expect(() => ActionsFactory.resolveFormData(formData)).toThrow("Missing actionType or payload");
  });

  it("throws if payload is missing", () => {
    const formData = new FormData();
    formData.append("actionType", "createItem");
    expect(() => ActionsFactory.resolveFormData(formData)).toThrow("Missing actionType or payload");
  });

  it("throws for an unknown action type", () => {
    const formData = new FormData();
    formData.append("actionType", "unknownAction");
    formData.append("payload", "{}");
    expect(() => ActionsFactory.resolveFormData(formData)).toThrow("Invalid action type");
  });
});

describe("createActionHandler", () => {
  function makeRequest(formData: FormData): Request {
    return new Request("http://localhost", {
      method: "POST",
      body: formData,
    });
  }

  it("resolves a successful action and calls onSuccess", async () => {
    const onSuccess = vi.fn();
    const handleAction = createActionHandler(
      { ActionsFactory, createAction },
      {
        getToken: () => "test-token",
        onSuccess,
      },
    );

    const { formData } = ActionsFactory.createFormData("createItem", { title: "Widget" });
    const result = await handleAction({ request: makeRequest(formData) });

    expect(result.success).toBe(true);
    expect(result.type).toBe("createItem");
    if (result.success) {
      expect(result.response).toEqual({ id: "123", title: "Widget" });
    }
    expect(onSuccess).toHaveBeenCalledWith('Item "Widget" created');
  });

  it("handles action failure and calls onError", async () => {
    // Create an action class that always fails
    class FailingAction extends BaseClientAction<{ reason: string }> {
      readonly type = "failAction";
      readonly method = "POST";
      protected get defaultSuccessMessage() { return "ok"; }
      protected get defaultErrorMessage() { return "boom"; }
      resolve() { throw new Error("Something broke"); }
    }

    const failMap = buildActionModule({ failAction: FailingAction });
    const failFactory = createActionsFactory(failMap);

    const onError = vi.fn();
    const extractError = vi.fn((err: unknown) => (err as Error).message);

    const handleAction = createActionHandler(failFactory, {
      getToken: () => "token",
      onError,
      extractError,
    });

    const { formData } = failFactory.ActionsFactory.createFormData("failAction", { reason: "test" });
    const result = await handleAction({ request: makeRequest(formData) });

    expect(result.success).toBe(false);
    expect(result.type).toBe("failAction");
    if (!result.success) {
      expect(result.error).toBe("Something broke");
    }
    expect(onError).toHaveBeenCalledWith("boom");
    expect(extractError).toHaveBeenCalled();
  });

  it("skips toasts when showToasts is false", async () => {
    const onSuccess = vi.fn();
    const handleAction = createActionHandler(
      { ActionsFactory, createAction },
      {
        getToken: () => "token",
        onSuccess,
      },
    );

    const { formData } = ActionsFactory.createFormData("createItem", { title: "Silent" });
    await handleAction({ request: makeRequest(formData) }, { showToasts: false });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("calls onLoading for actions with showLoadingToast", async () => {
    const onLoading = vi.fn();
    const onSuccess = vi.fn();
    const handleAction = createActionHandler(
      { ActionsFactory, createAction },
      {
        getToken: () => "token",
        onLoading,
        onSuccess,
      },
    );

    const { formData } = ActionsFactory.createFormData(
      "createItem",
      { title: "Slow" },
      { showLoadingToast: true, loadingMessage: "Creating..." },
    );
    const result = await handleAction({ request: makeRequest(formData) });

    expect(result.success).toBe(true);
    expect(onLoading).toHaveBeenCalledWith(
      expect.any(Promise),
      expect.objectContaining({
        loading: "Creating...",
        success: 'Item "Slow" created',
        error: 'Failed to create item "Slow"',
      }),
    );
    // onSuccess should NOT be called when loading toast was used
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("uses async getToken", async () => {
    const getToken = vi.fn().mockResolvedValue("async-token");
    const handleAction = createActionHandler(
      { ActionsFactory, createAction },
      { getToken },
    );

    const { formData } = ActionsFactory.createFormData("deleteItem", { id: "1" });
    const result = await handleAction({ request: makeRequest(formData) });

    expect(result.success).toBe(true);
    expect(getToken).toHaveBeenCalled();
  });
});
