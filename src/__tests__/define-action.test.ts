import { describe, it, expect, expectTypeOf } from "vitest";
import { defineAction, type ActionCreator } from "../define-action";
import type { ActionObject } from "../action-object";

// ─── Fixtures ────────────────────────────────────────────────────

const createItem = defineAction({
  type: "createItem",
  resolve: (payload: { title: string }) => ({
    id: "123",
    title: payload.title,
  }),
  successMessage: (payload) => `Item "${payload.title}" created`,
  errorMessage: "Failed to create item",
});

const deleteItem = defineAction({
  type: "deleteItem",
  method: "DELETE",
  resolve: (payload: { id: string }) => ({ deleted: true }),
  successMessage: "Item deleted",
  errorMessage: (payload) => `Failed to delete item ${payload.id}`,
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

  it("defaults method to 'post'", () => {
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

  it("successMessage resolves from definition after resolve", async () => {
    const action = createItem({ title: "Widget" });
    await action.resolve();
    expect(action.successMessage).toBe('Item "Widget" created');
  });

  it("errorMessage resolves from definition", () => {
    const action = deleteItem({ id: "42" });
    expect(action.errorMessage).toBe("Failed to delete item 42");
  });

  it("messages are undefined when definition omits them", () => {
    const action = minimalAction({ x: 5 });
    expect(action.successMessage).toBeUndefined();
    expect(action.errorMessage).toBeUndefined();
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
      ActionCreator<"createItem", { title: string }>
    >();
  });

  it("calling the creator returns ActionObject<void> for void context", () => {
    const action = createItem({ title: "x" });
    expectTypeOf(action).toMatchTypeOf<ActionObject<void>>();
  });

  it("calling the creator returns ActionObject<TContext> for typed context", () => {
    const action = contextAction({ name: "x" });
    expectTypeOf(action).toMatchTypeOf<ActionObject<{ token: string }>>();
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
});
