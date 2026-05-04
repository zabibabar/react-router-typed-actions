import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { defineAction } from "../define-action";
import { createFormData, resolveFormData } from "../form-data";
import { registerActions, _resetRegistryForTesting } from "../registry";
import { withMetaOverrides } from "../with-meta-overrides";
import { actionSuccess, actionFailure } from "../action-object";

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

const throwingMetaAction = defineAction<
  "throwingMeta",
  { name: string },
  never,
  void,
  ToastMeta
>({
  type: "throwingMeta",
  resolve: (payload) => {
    throw withMetaOverrides(new Error(`${payload.name} exploded`), {
      errorMessage: `${payload.name} failed dynamically`,
    });
  },
  meta: {
    successMessage: "Default success",
    errorMessage: "Default error",
  },
});

const noMetaAction = defineAction({
  type: "noMetaAction",
  resolve: (payload: { x: number }) => payload.x * 2,
});

beforeEach(() => {
  registerActions([
    createItem,
    deleteItem,
    dynamicAction,
    dynamicErrorAction,
    throwingMetaAction,
    noMetaAction,
  ]);
});

afterEach(() => {
  _resetRegistryForTesting();
});

// ─── createFormData / resolveFormData round-trip ─────────────────

describe("createFormData / resolveFormData round-trip", () => {
  it("round-trips a simple payload", () => {
    const { formData, method } = createFormData(createItem, {
      title: "Widget",
    });
    expect(method).toBe("POST");
    expect(formData.get("actionType")).toBe("createItem");

    const action = resolveFormData(formData);
    expect(action.type).toBe("createItem");
    expect(action.method).toBe("POST");
    expect(action.payload).toEqual({ title: "Widget" });
  });

  it("round-trips a Date in payload via SuperJSON", () => {
    const dateAction = defineAction({
      type: "dateAction",
      resolve: (p: { ts: Date }) => p,
    });
    registerActions([dateAction]);

    const date = new Date("2025-06-15T12:00:00Z");
    const { formData } = createFormData(dateAction, { ts: date });
    const action = resolveFormData(formData);
    expect(action.payload).toEqual({ ts: date });
  });

  it("round-trips a File in payload", () => {
    const fileAction = defineAction({
      type: "fileAction",
      resolve: (p: { doc: File }) => ({ ok: true }),
    });
    registerActions([fileAction]);

    const file = new File(["content"], "test.txt", { type: "text/plain" });
    const { formData } = createFormData(fileAction, { doc: file });

    expect(formData.get("file:doc")).toBeInstanceOf(Blob);

    const action = resolveFormData(formData);
    expect((action.payload as { doc: File }).doc).toBeInstanceOf(Blob);
  });

  it("works without registration (decoupled from registry)", () => {
    const standaloneAction = defineAction({
      type: "standaloneAction",
      resolve: (p: { value: number }) => p.value,
    });

    const { formData, method } = createFormData(standaloneAction, { value: 42 });
    expect(method).toBe("POST");
    expect(formData.get("actionType")).toBe("standaloneAction");
  });
});

// ─── ActionObject from resolveFormData ───────────────────────────

describe("ActionObject from resolveFormData", () => {
  it("has correct shape", () => {
    const { formData } = createFormData(createItem, {
      title: "Hello",
    });
    const action = resolveFormData(formData);
    expect(action.type).toBe("createItem");
    expect(action.method).toBe("POST");
    expect(action.payload).toEqual({ title: "Hello" });
    expect(typeof action.resolve).toBe("function");
  });

  it("resolve returns the expected result", async () => {
    const { formData } = createFormData(createItem, {
      title: "Test",
    });
    const action = resolveFormData(formData);
    const result = await action.resolve();
    expect(result).toEqual({ id: "123", title: "Test" });
  });

  it("meta returns static meta from definition", () => {
    const { formData } = createFormData(createItem, {
      title: "Widget",
    });
    const action = resolveFormData(formData);
    expect(action.meta).toEqual({
      successMessage: "Item created",
      errorMessage: "Failed to create item",
    });
  });

  it("meta is undefined when definition omits it", () => {
    const { formData } = createFormData(noMetaAction, { x: 5 });
    const action = resolveFormData(formData);
    expect(action.meta).toBeUndefined();
  });
});

// ─── Invalid / missing input ─────────────────────────────────────

describe("invalid / missing input", () => {
  it("throws for missing actionType in FormData", () => {
    const formData = new FormData();
    formData.set("payload", '{"json":"{}"}');
    expect(() => resolveFormData(formData)).toThrow(
      "missing actionType or payload",
    );
  });

  it("throws for missing payload in FormData", () => {
    const formData = new FormData();
    formData.set("actionType", "createItem");
    expect(() => resolveFormData(formData)).toThrow(
      "missing actionType or payload",
    );
  });

  it("throws for unknown actionType in FormData", () => {
    const formData = new FormData();
    formData.set("actionType", "NEVER_DEFINED");
    formData.set("payload", '{"json":"{}"}');
    expect(() => resolveFormData(formData)).toThrow(
      'Unknown action type "NEVER_DEFINED"',
    );
  });
});

// ─── withMetaOverrides round-trip ────────────────────────────────

describe("withMetaOverrides through resolve", () => {
  it("returns static meta before resolve is called", () => {
    const { formData } = createFormData(dynamicAction, {
      name: "Test",
    });
    const action = resolveFormData(formData);
    expect(action.meta).toEqual({
      successMessage: "Default success",
      errorMessage: "Default error",
    });
  });

  it("merges dynamic overrides into meta after resolve", async () => {
    const { formData } = createFormData(dynamicAction, {
      name: "TestItem",
    });
    const action = resolveFormData(formData);
    await action.resolve();
    expect(action.meta).toEqual({
      successMessage: "TestItem processed successfully",
      errorMessage: "Default error",
    });
  });

  it("merges dynamic error overrides into meta after resolve", async () => {
    const { formData } = createFormData(dynamicErrorAction, {
      name: "BadItem",
    });
    const action = resolveFormData(formData);
    await action.resolve();
    expect(action.meta).toEqual({
      successMessage: "Default success",
      errorMessage: "BadItem failed dynamically",
    });
  });

  it("unwraps data from MetaOverrideResult", async () => {
    const { formData } = createFormData(dynamicAction, {
      name: "Test",
    });
    const action = resolveFormData(formData);
    const result = await action.resolve();
    expect(result).toEqual({ processed: true });
  });

  it("keeps static meta when resolve returns raw data", async () => {
    const { formData } = createFormData(createItem, {
      title: "Widget",
    });
    const action = resolveFormData(formData);
    await action.resolve();
    expect(action.meta).toEqual({
      successMessage: "Item created",
      errorMessage: "Failed to create item",
    });
  });
});

// ─── actionSuccess / actionFailure helpers ───────────────────────

describe("actionSuccess / actionFailure", () => {
  it("actionSuccess creates a success result", () => {
    const { formData } = createFormData(createItem, { title: "Test" });
    const action = resolveFormData(formData);
    const result = actionSuccess(action, { id: "1", title: "Test" });
    expect(result).toEqual({
      type: "createItem",
      success: true,
      response: { id: "1", title: "Test" },
    });
  });

  it("actionFailure creates a failure result", () => {
    const { formData } = createFormData(createItem, { title: "Test" });
    const action = resolveFormData(formData);
    const result = actionFailure(action, "Something went wrong");
    expect(result).toEqual({
      type: "createItem",
      success: false,
      error: "Something went wrong",
    });
  });
});

// ─── Error-path meta overrides (thrown MetaOverrideResult) ──────

describe("thrown MetaOverrideResult in resolve", () => {
  it("unwraps the error from the MetaOverrideResult wrapper", async () => {
    const { formData } = createFormData(throwingMetaAction, { name: "Widget" });
    const action = resolveFormData(formData);

    await expect(action.resolve()).rejects.toThrow("Widget exploded");
  });

  it("merges dynamic overrides into meta after thrown MetaOverrideResult", async () => {
    const { formData } = createFormData(throwingMetaAction, { name: "Widget" });
    const action = resolveFormData(formData);

    try {
      await action.resolve();
    } catch {
      // expected
    }

    expect(action.meta).toEqual({
      successMessage: "Default success",
      errorMessage: "Widget failed dynamically",
    });
  });

  it("retains static meta for unoverridden keys after thrown MetaOverrideResult", async () => {
    const { formData } = createFormData(throwingMetaAction, { name: "Gadget" });
    const action = resolveFormData(formData);

    try {
      await action.resolve();
    } catch {
      // expected
    }

    expect(action.meta.successMessage).toBe("Default success");
    expect(action.meta.errorMessage).toBe("Gadget failed dynamically");
  });
});

// ─── createFormData method passthrough ──────────────────────────

describe("createFormData method passthrough", () => {
  it("returns DELETE method for a DELETE action", () => {
    const { method } = createFormData(deleteItem, { id: "1" });
    expect(method).toBe("DELETE");
  });

  it("returns POST method for a default action", () => {
    const { method } = createFormData(createItem, { title: "Test" });
    expect(method).toBe("POST");
  });
});

// ─── registerActions ────────────────────────────────────────────

describe("registerActions", () => {
  it("throws on duplicate action type within the same call", () => {
    const actionA = defineAction({
      type: "dupAction",
      resolve: () => "a",
    });
    const actionB = defineAction({
      type: "dupAction",
      resolve: () => "b",
    });

    expect(() => registerActions([actionA, actionB])).toThrow(
      'Duplicate action type "dupAction"',
    );
  });

  it("throws when registering a non-defineAction creator", () => {
    const fake = (() => {}) as any;
    fake.type = "fakeAction";

    expect(() => registerActions([fake])).toThrow(
      'missing its definition',
    );
  });

  it("registers multiple actions in a single call", () => {
    const actionA = defineAction({
      type: "multiA",
      resolve: () => "a",
    });
    const actionB = defineAction({
      type: "multiB",
      resolve: () => "b",
    });

    registerActions([actionA, actionB]);

    const fdA = new FormData();
    fdA.set("actionType", "multiA");
    fdA.set("payload", '{"json":"{}"}');
    expect(() => resolveFormData(fdA)).not.toThrow();

    const fdB = new FormData();
    fdB.set("actionType", "multiB");
    fdB.set("payload", '{"json":"{}"}');
    expect(() => resolveFormData(fdB)).not.toThrow();
  });
});
