import { describe, it, expect } from "vitest";
import { defineAction } from "../define-action";
import { createActionsFactory } from "../factory";
import { withMessageOverrides } from "../with-message-overrides";

// ─── Fixtures ────────────────────────────────────────────────────

const createItem = defineAction({
  type: "createItem",
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
  resolve: (payload: { name: string }) =>
    withMessageOverrides(
      { processed: true },
      { successMessage: `${payload.name} processed successfully` },
    ),
  successMessage: "Default success",
  errorMessage: "Default error",
});

const dynamicErrorAction = defineAction({
  type: "dynamicErrorAction",
  resolve: (payload: { name: string }) =>
    withMessageOverrides(null, {
      errorMessage: `${payload.name} failed dynamically`,
    }),
  successMessage: "Default success",
  errorMessage: "Default error",
});

const noMessageAction = defineAction({
  type: "noMessageAction",
  resolve: (payload: { x: number }) => payload.x * 2,
});

const factory = createActionsFactory([
  createItem,
  deleteItem,
  dynamicAction,
  dynamicErrorAction,
  noMessageAction,
]);

// ─── createFormData / resolveFormData round-trip ─────────────────

describe("createFormData / resolveFormData round-trip", () => {
  it("round-trips a simple payload", () => {
    const { formData, method } = factory.createFormData("createItem", {
      title: "Widget",
    });
    expect(method).toBe("POST");
    expect(formData.get("actionType")).toBe("createItem");

    const action = factory.resolveFormData(formData);
    expect(action.type).toBe("createItem");
    expect(action.name).toBe("createItem");
    expect(action.method).toBe("POST");
    expect(action.payload).toEqual({ title: "Widget" });
  });

  it("round-trips a Date in payload via SuperJSON", () => {
    const dateAction = defineAction({
      type: "dateAction",
      resolve: (p: { ts: Date }) => p,
    });
    const f = createActionsFactory([dateAction]);

    const date = new Date("2025-06-15T12:00:00Z");
    const { formData } = f.createFormData("dateAction", { ts: date });
    const action = f.resolveFormData(formData);
    expect(action.payload).toEqual({ ts: date });
  });

  it("round-trips a File in payload", () => {
    const fileAction = defineAction({
      type: "fileAction",
      resolve: (p: { doc: File }) => ({ ok: true }),
    });
    const f = createActionsFactory([fileAction]);

    const file = new File(["content"], "test.txt", { type: "text/plain" });
    const { formData } = f.createFormData("fileAction", { doc: file });

    expect(formData.get("file:doc")).toBeInstanceOf(Blob);

    const action = f.resolveFormData(formData);
    expect((action.payload as { doc: File }).doc).toBeInstanceOf(Blob);
  });
});

// ─── ActionObject from resolveFormData ───────────────────────────

describe("ActionObject from resolveFormData", () => {
  it("has correct shape", () => {
    const { formData } = factory.createFormData("createItem", {
      title: "Hello",
    });
    const action = factory.resolveFormData(formData);
    expect(action.type).toBe("createItem");
    expect(action.name).toBe("createItem");
    expect(action.method).toBe("POST");
    expect(action.payload).toEqual({ title: "Hello" });
    expect(typeof action.resolve).toBe("function");
  });

  it("resolve returns the expected result", async () => {
    const { formData } = factory.createFormData("createItem", {
      title: "Test",
    });
    const action = factory.resolveFormData(formData);
    const result = await action.resolve();
    expect(result).toEqual({ id: "123", title: "Test" });
  });

  it("resolves function-based successMessage with payload", async () => {
    const { formData } = factory.createFormData("createItem", {
      title: "Widget",
    });
    const action = factory.resolveFormData(formData);
    await action.resolve();
    expect(action.successMessage).toBe('Item "Widget" created');
  });

  it("resolves function-based errorMessage with payload", () => {
    const { formData } = factory.createFormData("deleteItem", { id: "42" });
    const action = factory.resolveFormData(formData);
    expect(action.errorMessage).toBe("Failed to delete 42");
  });

  it("returns undefined for optional messages", () => {
    const { formData } = factory.createFormData("noMessageAction", { x: 5 });
    const action = factory.resolveFormData(formData);
    expect(action.successMessage).toBeUndefined();
    expect(action.errorMessage).toBeUndefined();
  });
});

// ─── Invalid / missing input ─────────────────────────────────────

describe("invalid / missing input", () => {
  it("throws for unknown action type in createFormData", () => {
    expect(() => factory.createFormData("nonExistent", {})).toThrow(
      'Invalid action type "nonExistent"',
    );
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
      'Invalid action type "unknown"',
    );
  });
});

// ─── withMessageOverrides round-trip ─────────────────────────────

describe("withMessageOverrides through resolve", () => {
  it("returns static default before resolve is called", () => {
    const { formData } = factory.createFormData("dynamicAction", {
      name: "Test",
    });
    const action = factory.resolveFormData(formData);
    expect(action.successMessage).toBe("Default success");
  });

  it("returns dynamic successMessage after resolve", async () => {
    const { formData } = factory.createFormData("dynamicAction", {
      name: "TestItem",
    });
    const action = factory.resolveFormData(formData);
    await action.resolve();
    expect(action.successMessage).toBe("TestItem processed successfully");
  });

  it("returns dynamic errorMessage after resolve", async () => {
    const { formData } = factory.createFormData("dynamicErrorAction", {
      name: "BadItem",
    });
    const action = factory.resolveFormData(formData);
    await action.resolve();
    expect(action.errorMessage).toBe("BadItem failed dynamically");
  });

  it("unwraps data from MessageOverrideResult", async () => {
    const { formData } = factory.createFormData("dynamicAction", {
      name: "Test",
    });
    const action = factory.resolveFormData(formData);
    const result = await action.resolve();
    expect(result).toEqual({ processed: true });
  });

  it("keeps static message when resolve returns raw data", async () => {
    const { formData } = factory.createFormData("createItem", {
      title: "Widget",
    });
    const action = factory.resolveFormData(formData);
    await action.resolve();
    expect(action.successMessage).toBe('Item "Widget" created');
  });
});
