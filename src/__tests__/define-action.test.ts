import { describe, it, expect, expectTypeOf } from "vitest";
import { defineAction, getDefinitionFor, type Action } from "../define-action";
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

// ─── defineAction returns Action ─────────────────────────────────

describe("defineAction", () => {
  it("returns an Action with identity properties", () => {
    expect(createItem.type).toBe("createItem");
    expect(createItem.method).toBe("POST");
  });

  it("defaults method to 'POST'", () => {
    expect(minimalAction.method).toBe("POST");
  });

  it("uses explicit method when provided", () => {
    expect(deleteItem.method).toBe("DELETE");
  });
});

// ─── Action is callable ─────────────────────────────────────────

describe("Action callable", () => {
  it("produces an ActionObject with correct shape", () => {
    const action = createItem({ title: "Widget" });
    expect(action.type).toBe("createItem");
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

  it("stores meta accessible via getDefinitionFor", () => {
    const def = getDefinitionFor(createItem)!;
    expect(def.meta).toEqual({
      successMessage: "Item created",
      errorMessage: "Failed to create item",
    });
  });

  it("definition meta is undefined when not provided", () => {
    const def = getDefinitionFor(minimalAction);
    expect(def?.meta).toBeUndefined();
  });

  it("getDefinitionFor returns undefined for a plain function", () => {
    const plainFn = (() => {}) as unknown as Action;
    expect(getDefinitionFor(plainFn)).toBeUndefined();
  });
});

// ─── Type tests ──────────────────────────────────────────────────

describe("type inference", () => {
  it("preserves literal type", () => {
    expectTypeOf(createItem.type).toEqualTypeOf<"createItem">();
    expectTypeOf(deleteItem.type).toEqualTypeOf<"deleteItem">();
  });

  it("Action is assignable to its type", () => {
    expectTypeOf(createItem).toMatchTypeOf<
      Action<"createItem", { title: string }, { id: string; title: string }, void, ItemMeta>
    >();
  });

  it("calling the creator returns ActionObject with TResult, TContext, TMeta for typed meta", () => {
    const action = createItem({ title: "x" });
    expectTypeOf(action).toMatchTypeOf<ActionObject<{ id: string; title: string }, void, ItemMeta>>();
  });

  it("calling the creator returns ActionObject with TResult, TContext, TMeta for typed context", () => {
    const action = contextAction({ name: "x" });
    expectTypeOf(action).toMatchTypeOf<ActionObject<{ name: string; token: string }, { token: string }, void>>();
  });

  it("resolve on void-context ActionObject takes no args and returns typed result", () => {
    const action = createItem({ title: "x" });
    expectTypeOf(action.resolve).toEqualTypeOf<() => Promise<{ id: string; title: string }>>();
  });

  it("resolve on typed-context ActionObject requires context and returns typed result", () => {
    const action = contextAction({ name: "x" });
    expectTypeOf(action.resolve).toEqualTypeOf<
      (context: { token: string }) => Promise<{ name: string; token: string }>
    >();
  });

  it("TMeta defaults to void when meta config is omitted", () => {
    const action = minimalAction({ x: 1 });
    expectTypeOf(action).toMatchTypeOf<ActionObject<number, void, void>>();
  });
});
