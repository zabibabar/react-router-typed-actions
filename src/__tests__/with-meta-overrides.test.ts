import { describe, it, expect } from "vitest";
import {
  withMetaOverrides,
  isMetaOverride,
} from "../with-meta-overrides";

describe("withMetaOverrides", () => {
  it("tags a result with arbitrary meta overrides", () => {
    const result = withMetaOverrides(
      { id: 1 },
      { toast: "Created!", severity: "success" },
    );
    expect(result.data).toEqual({ id: 1 });
    expect(result.overrides.toast).toBe("Created!");
    expect(result.overrides.severity).toBe("success");
    expect(isMetaOverride(result)).toBe(true);
  });

  it("tags with a single override key", () => {
    const result = withMetaOverrides("ok", { label: "Yay" });
    expect(result.data).toBe("ok");
    expect(result.overrides.label).toBe("Yay");
    expect(isMetaOverride(result)).toBe(true);
  });

  it("handles null data", () => {
    const result = withMetaOverrides(null, { errorCode: 500 });
    expect(result.data).toBeNull();
    expect(isMetaOverride(result)).toBe(true);
  });

  it("handles empty overrides", () => {
    const result = withMetaOverrides({ x: 1 }, {});
    expect(result.data).toEqual({ x: 1 });
    expect(result.overrides).toEqual({});
    expect(isMetaOverride(result)).toBe(true);
  });

  it("preserves complex nested meta shapes", () => {
    interface NotificationMeta {
      title: string;
      body: string;
      actions: { label: string; href: string }[];
    }
    const result = withMetaOverrides<number, NotificationMeta>(42, {
      title: "Updated",
      actions: [{ label: "View", href: "/view" }],
    });
    expect(result.data).toBe(42);
    expect(result.overrides.title).toBe("Updated");
    expect(result.overrides.actions).toEqual([{ label: "View", href: "/view" }]);
  });
});

describe("isMetaOverride", () => {
  it("returns true for tagged results", () => {
    const tagged = withMetaOverrides(42, { status: "done" });
    expect(isMetaOverride(tagged)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isMetaOverride(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isMetaOverride(undefined)).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isMetaOverride(42)).toBe(false);
    expect(isMetaOverride("hello")).toBe(false);
    expect(isMetaOverride(true)).toBe(false);
  });

  it("returns false for plain objects that duck-type as overrides", () => {
    const duckTyped = {
      data: { id: 1 },
      overrides: { toast: "sneaky" },
    };
    expect(isMetaOverride(duckTyped)).toBe(false);
  });

  it("returns false for objects with data + overrides but no symbol", () => {
    expect(
      isMetaOverride({ data: "hello", overrides: { x: 1 } }),
    ).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isMetaOverride([1, 2, 3])).toBe(false);
  });
});
