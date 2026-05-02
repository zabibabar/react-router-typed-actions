import { describe, it, expect, expectTypeOf } from "vitest";
import {
  defineAction,
  buildActionModule,
  type ActionDefinition,
  type InferPayloadMap,
  type InferActionMap,
  type InferActions,
} from "../define-action";

// ─── Fixtures ────────────────────────────────────────────────────

const createItem = defineAction({
  type: "createItem",
  method: "post",
  resolve: (payload: { title: string }) => ({ id: "123", title: payload.title }),
  successMessage: (payload) => `Item "${payload.title}" created`,
  errorMessage: "Failed to create item",
});

const deleteItem = defineAction({
  type: "deleteItem",
  method: "delete",
  resolve: (payload: { id: string }) => ({ deleted: true }),
  successMessage: "Item deleted",
  errorMessage: (payload) => `Failed to delete item ${payload.id}`,
});

const contextAction = defineAction({
  type: "contextAction",
  method: "post",
  resolve: (payload: { name: string }, context: { token: string }) => ({
    name: payload.name,
    token: context.token,
  }),
  successMessage: "Done",
  errorMessage: "Failed",
});

// ─── defineAction ────────────────────────────────────────────────

describe("defineAction", () => {
  it("returns an object with the correct shape", () => {
    expect(createItem.type).toBe("createItem");
    expect(createItem.method).toBe("post");
    expect(typeof createItem.resolve).toBe("function");
    expect(typeof createItem.successMessage).toBe("function");
    expect(createItem.errorMessage).toBe("Failed to create item");
  });

  it("supports string messages", () => {
    expect(deleteItem.successMessage).toBe("Item deleted");
    expect(createItem.errorMessage).toBe("Failed to create item");
  });

  it("supports function messages", () => {
    const successMsg = createItem.successMessage;
    expect(typeof successMsg).toBe("function");
    if (typeof successMsg === "function") {
      expect(successMsg({ title: "Widget" })).toBe('Item "Widget" created');
    }

    const errorMsg = deleteItem.errorMessage;
    expect(typeof errorMsg).toBe("function");
    if (typeof errorMsg === "function") {
      expect(errorMsg({ id: "42" })).toBe("Failed to delete item 42");
    }
  });

  it("resolve is callable with void context", () => {
    const result = createItem.resolve({ title: "Test" }, undefined as void);
    expect(result).toEqual({ id: "123", title: "Test" });
  });

  it("resolve receives context when defined", () => {
    const result = contextAction.resolve({ name: "test" }, { token: "abc" });
    expect(result).toEqual({ name: "test", token: "abc" });
  });
});

// ─── buildActionModule ───────────────────────────────────────────

describe("buildActionModule", () => {
  it("returns the same object passed in", () => {
    const module = buildActionModule({ createItem, deleteItem });
    expect(module.createItem).toBe(createItem);
    expect(module.deleteItem).toBe(deleteItem);
  });

  it("accepts modules with explicit TContext", () => {
    const module = buildActionModule<{ token: string }>({ contextAction });
    expect(module.contextAction).toBe(contextAction);
  });

  it("rejects key/type mismatch at compile time", () => {
    // @ts-expect-error — key "wrong" does not match action type "createItem"
    buildActionModule({ wrong: createItem });
  });
});

// ─── Type Tests ──────────────────────────────────────────────────

describe("type inference", () => {
  const module = buildActionModule({ createItem, deleteItem });

  it("defineAction preserves literal type", () => {
    expectTypeOf(createItem.type).toEqualTypeOf<"createItem">();
    expectTypeOf(deleteItem.type).toEqualTypeOf<"deleteItem">();
  });

  it("ActionDefinition interface matches defineAction output", () => {
    expectTypeOf(createItem).toMatchTypeOf<
      ActionDefinition<"createItem", { title: string }>
    >();
  });

  it("InferPayloadMap extracts payload types", () => {
    type Payloads = InferPayloadMap<typeof module>;
    expectTypeOf<Payloads["createItem"]>().toEqualTypeOf<{ title: string }>();
    expectTypeOf<Payloads["deleteItem"]>().toEqualTypeOf<{ id: string }>();
  });

  it("InferActionMap maps keys to definitions", () => {
    type Map = InferActionMap<typeof module>;
    expectTypeOf<Map["createItem"]>().toEqualTypeOf<typeof createItem>();
    expectTypeOf<Map["deleteItem"]>().toEqualTypeOf<typeof deleteItem>();
  });

  it("InferActions is a union of definitions", () => {
    type Actions = InferActions<typeof module>;
    expectTypeOf<Actions>().toEqualTypeOf<
      typeof createItem | typeof deleteItem
    >();
  });

  it("TContext flows through to resolve signature", () => {
    const ctxModule = buildActionModule<{ token: string }>({ contextAction });
    type Resolve = (typeof ctxModule)["contextAction"]["resolve"];
    expectTypeOf<Parameters<Resolve>[1]>().toEqualTypeOf<{ token: string }>();
  });
});
