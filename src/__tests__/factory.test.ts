import { describe, it, expect } from "vitest";
import { defineAction, buildActionModule } from "../define-action";
import { createActionsFactory } from "../factory";

// ─── Fixtures ────────────────────────────────────────────────────

const createItem = defineAction({
  type: "createItem",
  method: "post",
  resolve: (payload: { title: string }) => ({
    id: "123",
    title: payload.title,
  }),
  successMessage: (p) => `Item "${p.title}" created`,
  errorMessage: "Failed to create item",
});

const deleteItem = defineAction({
  type: "deleteItem",
  method: "delete",
  resolve: (payload: { id: string }) => ({ deleted: true }),
  successMessage: "Deleted",
  errorMessage: (p) => `Failed to delete ${p.id}`,
});

const dynamicAction = defineAction({
  type: "dynamicAction",
  method: "post",
  resolve: (payload: { name: string }) => ({
    data: { processed: true },
    successMessage: `${payload.name} processed successfully`,
  }),
  successMessage: "Default success",
  errorMessage: "Default error",
});

const dynamicErrorAction = defineAction({
  type: "dynamicErrorAction",
  method: "post",
  resolve: (payload: { name: string }) => ({
    data: null,
    errorMessage: `${payload.name} failed dynamically`,
  }),
  successMessage: "Default success",
  errorMessage: "Default error",
});

const module = buildActionModule({
  createItem,
  deleteItem,
  dynamicAction,
  dynamicErrorAction,
});
const factory = createActionsFactory(module);

// ─── createFormData / resolveFormData round-trip ─────────────────

describe("createFormData / resolveFormData round-trip", () => {
  it("round-trips a simple payload", () => {
    const { formData, method } = factory.createFormData("createItem", {
      title: "Widget",
    });
    expect(method).toBe("post");
    expect(formData.get("actionType")).toBe("createItem");

    const action = factory.resolveFormData(formData);
    expect(action.type).toBe("createItem");
    expect(action.method).toBe("post");
    expect(action.payload).toEqual({ title: "Widget" });
  });

  it("round-trips a Date in payload via SuperJSON", () => {
    const dateAction = defineAction({
      type: "dateAction",
      method: "post",
      resolve: (p: { ts: Date }) => p,
      successMessage: "ok",
      errorMessage: "fail",
    });
    const f = createActionsFactory(buildActionModule({ dateAction }));

    const date = new Date("2025-06-15T12:00:00Z");
    const { formData } = f.createFormData("dateAction", { ts: date });
    const action = f.resolveFormData(formData);
    expect(action.payload).toEqual({ ts: date });
  });

  it("round-trips a File in payload", () => {
    const fileAction = defineAction({
      type: "fileAction",
      method: "post",
      resolve: (p: { doc: File }) => ({ ok: true }),
      successMessage: "ok",
      errorMessage: "fail",
    });
    const f = createActionsFactory(buildActionModule({ fileAction }));

    const file = new File(["content"], "test.txt", { type: "text/plain" });
    const { formData } = f.createFormData("fileAction", { doc: file });

    expect(formData.get("file:doc")).toBeInstanceOf(Blob);

    const action = f.resolveFormData(formData);
    expect((action.payload as { doc: File }).doc).toBeInstanceOf(Blob);
  });

  it("round-trips options through FormData", () => {
    const { formData } = factory.createFormData(
      "createItem",
      { title: "T" },
      { successMessageOverride: "Custom!" },
    );
    const action = factory.resolveFormData(formData);
    expect(action.successMessage).toBe("Custom!");
  });
});

// ─── createAction ────────────────────────────────────────────────

describe("createAction", () => {
  it("returns an action object with correct shape", () => {
    const action = factory.createAction("createItem", { title: "Hello" });
    expect(action.type).toBe("createItem");
    expect(action.method).toBe("post");
    expect(action.payload).toEqual({ title: "Hello" });
    expect(typeof action.resolve).toBe("function");
    expect(typeof action.successMessage).toBe("string");
    expect(typeof action.errorMessage).toBe("string");
  });

  it("resolve returns the expected result", async () => {
    const action = factory.createAction("createItem", { title: "Test" });
    const result = await action.resolve(undefined);
    expect(result).toEqual({ id: "123", title: "Test" });
  });

  it("resolves function-based successMessage with payload", () => {
    const action = factory.createAction("createItem", { title: "Widget" });
    expect(action.successMessage).toBe('Item "Widget" created');
  });

  it("resolves function-based errorMessage with payload", () => {
    const action = factory.createAction("deleteItem", { id: "42" });
    expect(action.errorMessage).toBe("Failed to delete 42");
  });

  it("returns static string messages as-is", () => {
    const action = factory.createAction("deleteItem", { id: "1" });
    expect(action.successMessage).toBe("Deleted");
  });
});

// ─── Invalid / missing input ─────────────────────────────────────

describe("invalid / missing input", () => {
  it("throws for unknown action type in createAction", () => {
    expect(() =>
      factory.createAction("nonExistent" as never, {} as never),
    ).toThrow('Unknown action type "nonExistent"');
  });

  it("throws for unknown action type in createFormData", () => {
    expect(() =>
      factory.createFormData("nonExistent" as never, {} as never),
    ).toThrow('Unknown action type "nonExistent"');
  });

  it("throws for missing actionType in FormData", () => {
    const formData = new FormData();
    formData.set("payload", '{"json":"{}"}');
    expect(() => factory.resolveFormData(formData)).toThrow(
      "missing actionType or payload",
    );
  });

  it("throws for missing payload in FormData", () => {
    const formData = new FormData();
    formData.set("actionType", "createItem");
    expect(() => factory.resolveFormData(formData)).toThrow(
      "missing actionType or payload",
    );
  });

  it("throws for unknown actionType in FormData", () => {
    const formData = new FormData();
    formData.set("actionType", "unknown");
    formData.set("payload", '{"json":"{}"}');
    expect(() => factory.resolveFormData(formData)).toThrow(
      'Unknown action type "unknown"',
    );
  });
});

// ─── Dynamic messages from resolve ───────────────────────────────

describe("dynamic messages from resolve", () => {
  it("returns static default before resolve is called", () => {
    const action = factory.createAction("dynamicAction", { name: "Test" });
    expect(action.successMessage).toBe("Default success");
  });

  it("returns dynamic successMessage after resolve", async () => {
    const action = factory.createAction("dynamicAction", {
      name: "TestItem",
    });
    await action.resolve(undefined);
    expect(action.successMessage).toBe("TestItem processed successfully");
  });

  it("returns dynamic errorMessage after resolve", async () => {
    const action = factory.createAction("dynamicErrorAction", {
      name: "BadItem",
    });
    await action.resolve(undefined);
    expect(action.errorMessage).toBe("BadItem failed dynamically");
  });

  it("keeps static message when resolve returns raw data", async () => {
    const action = factory.createAction("createItem", { title: "Widget" });
    await action.resolve(undefined);
    expect(action.successMessage).toBe('Item "Widget" created');
  });

  it("options override takes precedence over dynamic message", async () => {
    const action = factory.createAction(
      "dynamicAction",
      { name: "Test" },
      { successMessageOverride: "Options win!" },
    );
    await action.resolve(undefined);
    expect(action.successMessage).toBe("Options win!");
  });

  it("options errorMessageOverride takes precedence over dynamic", async () => {
    const action = factory.createAction(
      "dynamicErrorAction",
      { name: "Test" },
      { errorMessageOverride: "Forced error" },
    );
    await action.resolve(undefined);
    expect(action.errorMessage).toBe("Forced error");
  });
});
