import { describe, it, expect, expectTypeOf } from "vitest";
import { defineAction, type ActionCreator } from "../define-action";
import type { ActionObject } from "../action-object";

// ─── Fixtures ────────────────────────────────────────────────────

interface ItemMeta {
  successMessage: string;
  errorMessage: string;
}

const createItem = defineAction<
  "createItem",
  { title: string },
  { id: string; title: string },
  void,
  ItemMeta
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

const deleteItem = defineAction({
  type: "deleteItem",
  method: "DELETE",
  resolve: (payload: { id: string }) => ({ deleted: true }),
});

const contextAction = defineAction({
  type: "contextAction",
  resolve: (payload: { name: string }, context: { token: string }) => ({
    name: payload.name,
    token: context.token,
  }),
});

const minimalAction = defineAction({
  type: "minimal",
  resolve: (payload: { x: number }) => payload.x * 2,
});

// ─── defineAction returns ActionCreator ──────────────────────────

describe("defineAction", () => {
  it("returns an ActionCreator with identity properties", () => {
    expect(createItem.type).toBe("createItem");
    expect(createItem.method).toBe("POST");
    expect(createItem.name).toBe("createItem");
  });

  it("defaults method to 'POST'", () => {
    expect(minimalAction.method).toBe("POST");
  });

  it("defaults name to type", () => {
    expect(minimalAction.name).toBe("minimal");
  });

  it("uses explicit name when provided", () => {
    const action = defineAction({
      type: "custom",
      name: "[Campaign] Create Campaign",
      resolve: () => null,
    });
    expect(action.name).toBe("[Campaign] Create Campaign");
  });

  it("uses explicit method when provided", () => {
    expect(deleteItem.method).toBe("DELETE");
  });
});

// ─── ActionCreator is callable ───────────────────────────────────

describe("ActionCreator callable", () => {
  it("produces an ActionObject with correct shape", () => {
    const action = createItem({ title: "Widget" });
    expect(action.type).toBe("createItem");
    expect(action.name).toBe("createItem");
    expect(action.method).toBe("POST");
    expect(action.payload).toEqual({ title: "Widget" });
    expect(typeof action.resolve).toBe("function");
  });

  it("resolve returns the expected result", async () => {
    const action = createItem({ title: "Test" });
    const result = await action.resolve();
    expect(result).toEqual({ id: "123", title: "Test" });
  });

  it("resolve receives context when defined", async () => {
    const action = contextAction({ name: "test" });
    const result = await action.resolve({ token: "abc" });
    expect(result).toEqual({ name: "test", token: "abc" });
  });

  it("stores meta on the internal _definition", () => {
    const def = (createItem as any)._definition;
    expect(def.meta).toEqual({
      successMessage: "Item created",
      errorMessage: "Failed to create item",
    });
  });

  it("_definition.meta is undefined when not provided", () => {
    const def = (minimalAction as any)._definition;
    expect(def.meta).toBeUndefined();
  });
});

// ─── Type tests ──────────────────────────────────────────────────

describe("type inference", () => {
  it("preserves literal type", () => {
    expectTypeOf(createItem.type).toEqualTypeOf<"createItem">();
    expectTypeOf(deleteItem.type).toEqualTypeOf<"deleteItem">();
  });

  it("ActionCreator is assignable to its type", () => {
    expectTypeOf(createItem).toMatchTypeOf<
      ActionCreator<"createItem", { title: string }, { id: string; title: string }, void, ItemMeta>
    >();
  });

  it("calling the creator returns ActionObject<void, ItemMeta> for typed meta", () => {
    const action = createItem({ title: "x" });
    expectTypeOf(action).toMatchTypeOf<ActionObject<void, ItemMeta>>();
  });

  it("calling the creator returns ActionObject<TContext, void> for typed context", () => {
    const action = contextAction({ name: "x" });
    expectTypeOf(action).toMatchTypeOf<ActionObject<{ token: string }, void>>();
  });

  it("resolve on void-context ActionObject takes no args", () => {
    const action = createItem({ title: "x" });
    expectTypeOf(action.resolve).toEqualTypeOf<() => Promise<unknown>>();
  });

  it("resolve on typed-context ActionObject requires context", () => {
    const action = contextAction({ name: "x" });
    expectTypeOf(action.resolve).toEqualTypeOf<
      (context: { token: string }) => Promise<unknown>
    >();
  });

  it("TMeta defaults to void when meta config is omitted", () => {
    const action = minimalAction({ x: 1 });
    expectTypeOf(action).toMatchTypeOf<ActionObject<void, void>>();
  });
});
