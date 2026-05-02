import { describe, it, expect } from "vitest";
import {
  withMessageOverrides,
  isMessageOverride,
} from "../with-message-overrides";

describe("withMessageOverrides", () => {
  it("tags a result with both overrides", () => {
    const result = withMessageOverrides({ id: 1 }, {
      successMessage: "Created!",
      errorMessage: "Oops",
    });
    expect(result.data).toEqual({ id: 1 });
    expect(result.overrides.successMessage).toBe("Created!");
    expect(result.overrides.errorMessage).toBe("Oops");
    expect(isMessageOverride(result)).toBe(true);
  });

  it("tags with only successMessage", () => {
    const result = withMessageOverrides("ok", { successMessage: "Yay" });
    expect(result.data).toBe("ok");
    expect(result.overrides.successMessage).toBe("Yay");
    expect(result.overrides.errorMessage).toBeUndefined();
    expect(isMessageOverride(result)).toBe(true);
  });

  it("handles null data", () => {
    const result = withMessageOverrides(null, { errorMessage: "Failed" });
    expect(result.data).toBeNull();
    expect(isMessageOverride(result)).toBe(true);
  });

  it("handles empty overrides", () => {
    const result = withMessageOverrides({ x: 1 }, {});
    expect(result.data).toEqual({ x: 1 });
    expect(result.overrides).toEqual({});
    expect(isMessageOverride(result)).toBe(true);
  });
});

describe("isMessageOverride", () => {
  it("returns true for tagged results", () => {
    const tagged = withMessageOverrides(42, { successMessage: "done" });
    expect(isMessageOverride(tagged)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isMessageOverride(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isMessageOverride(undefined)).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isMessageOverride(42)).toBe(false);
    expect(isMessageOverride("hello")).toBe(false);
    expect(isMessageOverride(true)).toBe(false);
  });

  it("returns false for plain objects that duck-type as overrides", () => {
    const duckTyped = {
      data: { id: 1 },
      successMessage: "I look like an override",
      overrides: { successMessage: "sneaky" },
    };
    expect(isMessageOverride(duckTyped)).toBe(false);
  });

  it("returns false for objects with data + successMessage but no symbol", () => {
    expect(
      isMessageOverride({ data: "hello", successMessage: "yes" }),
    ).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isMessageOverride([1, 2, 3])).toBe(false);
  });
});
