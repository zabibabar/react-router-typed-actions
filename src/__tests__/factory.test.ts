import { describe, it, expect } from "vitest";
import { defineAction } from "../define-action";
import { createActionsFactory } from "../factory";
import { withMetaOverrides } from "../with-meta-overrides";

// ─── Fixtures ────────────────────────────────────────────────────

interface ToastMeta {
  successMessage: string;
  errorMessage: string;
}

const createItem = defineAction<
  "createItem",
  { title: string },
  { id: string; title: string },
  void,
  ToastMeta
>({
  type: "createItem",
  resolve: (payload) => ({
    id: "123",
    title: payload.title,
  }),
  meta: {
    successMessage: "Item created",
    errorMessage: "Failed to create item",
  },
});

const deleteItem = defineAction<
  "deleteItem",
  { id: string },
  { deleted: boolean },
  void,
  ToastMeta
>({
  type: "deleteItem",
  method: "DELETE",
  resolve: (payload: { id: string }) => ({ deleted: true }),
  meta: {
    successMessage: "Deleted",
    errorMessage: "Failed to delete",
  },
});

const dynamicAction = defineAction<
  "dynamicAction",
  { name: string },
  { processed: boolean },
  void,
  ToastMeta
>({
  type: "dynamicAction",
  resolve: (payload) =>
    withMetaOverrides(
      { processed: true },
      { successMessage: `${payload.name} processed successfully` },
    ),
  meta: {
    successMessage: "Default success",
    errorMessage: "Default error",
  },
});

const dynamicErrorAction = defineAction<
  "dynamicErrorAction",
  { name: string },
  null,
  void,
  ToastMeta
>({
  type: "dynamicErrorAction",
  resolve: (payload) =>
    withMetaOverrides(null, {
      errorMessage: `${payload.name} failed dynamically`,
    }),
  meta: {
    successMessage: "Default success",
    errorMessage: "Default error",
  },
});

const noMetaAction = defineAction({
  type: "noMetaAction",
  resolve: (payload: { x: number }) => payload.x * 2,
});

const factory = createActionsFactory([
  createItem,
  deleteItem,
  dynamicAction,
  dynamicErrorAction,
  noMetaAction,
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

  it("meta returns static meta from definition", () => {
    const { formData } = factory.createFormData("createItem", {
      title: "Widget",
    });
    const action = factory.resolveFormData(formData);
    expect(action.meta).toEqual({
      successMessage: "Item created",
      errorMessage: "Failed to create item",
    });
  });

  it("meta is undefined when definition omits it", () => {
    const { formData } = factory.createFormData("noMetaAction", { x: 5 });
    const action = factory.resolveFormData(formData);
    expect(action.meta).toBeUndefined();
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

// ─── withMetaOverrides round-trip ────────────────────────────────

describe("withMetaOverrides through resolve", () => {
  it("returns static meta before resolve is called", () => {
    const { formData } = factory.createFormData("dynamicAction", {
      name: "Test",
    });
    const action = factory.resolveFormData(formData);
    expect(action.meta).toEqual({
      successMessage: "Default success",
      errorMessage: "Default error",
    });
  });

  it("merges dynamic overrides into meta after resolve", async () => {
    const { formData } = factory.createFormData("dynamicAction", {
      name: "TestItem",
    });
    const action = factory.resolveFormData(formData);
    await action.resolve();
    expect(action.meta).toEqual({
      successMessage: "TestItem processed successfully",
      errorMessage: "Default error",
    });
  });

  it("merges dynamic error overrides into meta after resolve", async () => {
    const { formData } = factory.createFormData("dynamicErrorAction", {
      name: "BadItem",
    });
    const action = factory.resolveFormData(formData);
    await action.resolve();
    expect(action.meta).toEqual({
      successMessage: "Default success",
      errorMessage: "BadItem failed dynamically",
    });
  });

  it("unwraps data from MetaOverrideResult", async () => {
    const { formData } = factory.createFormData("dynamicAction", {
      name: "Test",
    });
    const action = factory.resolveFormData(formData);
    const result = await action.resolve();
    expect(result).toEqual({ processed: true });
  });

  it("keeps static meta when resolve returns raw data", async () => {
    const { formData } = factory.createFormData("createItem", {
      title: "Widget",
    });
    const action = factory.resolveFormData(formData);
    await action.resolve();
    expect(action.meta).toEqual({
      successMessage: "Item created",
      errorMessage: "Failed to create item",
    });
  });
});
