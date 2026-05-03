import { describe, it, expect } from "vitest";
import { serialize, deserialize } from "../serialization";

function roundTrip(payload: unknown) {
  const { encoded, files } = serialize(payload);
  return deserialize(encoded, files);
}

// ─── SuperJSON type round-trips ──────────────────────────────────

describe("serialize/deserialize — SuperJSON types", () => {
  it("handles Date", () => {
    const date = new Date("2025-06-15T12:00:00Z");
    expect(roundTrip({ d: date })).toEqual({ d: date });
  });

  it("handles Map", () => {
    const map = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    expect(roundTrip({ m: map })).toEqual({ m: map });
  });

  it("handles Set", () => {
    const set = new Set([1, 2, 3]);
    expect(roundTrip({ s: set })).toEqual({ s: set });
  });

  it("handles BigInt", () => {
    const result = roundTrip({ n: BigInt(9007199254740991) }) as {
      n: bigint;
    };
    expect(result.n).toBe(BigInt(9007199254740991));
  });

  it("handles undefined", () => {
    expect(roundTrip({ a: 1, b: undefined })).toEqual({ a: 1, b: undefined });
  });

  it("handles RegExp", () => {
    const re = /foo\d+/gi;
    expect(roundTrip({ r: re })).toEqual({ r: re });
  });

  it("handles NaN", () => {
    const result = roundTrip({ n: NaN }) as { n: number };
    expect(Number.isNaN(result.n)).toBe(true);
  });

  it("handles Infinity", () => {
    expect(roundTrip({ pos: Infinity, neg: -Infinity })).toEqual({
      pos: Infinity,
      neg: -Infinity,
    });
  });

  it("handles null", () => {
    expect(roundTrip({ x: null })).toEqual({ x: null });
  });

  it("handles nested objects", () => {
    const payload = { a: { b: { c: 42, d: [1, 2, { e: "deep" }] } } };
    expect(roundTrip(payload)).toEqual(payload);
  });

  it("handles arrays", () => {
    expect(roundTrip([1, "two", null, true])).toEqual([1, "two", null, true]);
  });
});

// ─── File/Blob round-trips ───────────────────────────────────────

describe("serialize/deserialize — File/Blob", () => {
  it("handles a single File", () => {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    const { encoded, files } = serialize({ avatar: file });

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("avatar");
    expect(files[0].file).toBe(file);

    const result = deserialize(encoded, files) as { avatar: File };
    expect(result.avatar).toBe(file);
  });

  it("handles a single Blob", () => {
    const blob = new Blob(["data"], { type: "application/octet-stream" });
    const { encoded, files } = serialize({ data: blob });

    expect(files).toHaveLength(1);
    expect(files[0].file).toBe(blob);

    const result = deserialize(encoded, files) as { data: Blob };
    expect(result.data).toBe(blob);
  });

  it("handles a deeply nested File", () => {
    const file = new File(["nested"], "nested.png", { type: "image/png" });
    const payload = { user: { profile: { images: [file] } } };
    const { encoded, files } = serialize(payload);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("user.profile.images.0");

    const result = deserialize(encoded, files) as typeof payload;
    expect(result.user.profile.images[0]).toBe(file);
  });

  it("handles mixed File + Date payload", () => {
    const file = new File(["mix"], "mix.txt");
    const date = new Date("2025-01-01");
    const payload = { file, createdAt: date, count: 42 };
    const { encoded, files } = serialize(payload);

    expect(files).toHaveLength(1);
    const result = deserialize(encoded, files) as typeof payload;
    expect(result.file).toBe(file);
    expect(result.createdAt).toEqual(date);
    expect(result.count).toBe(42);
  });

  it("handles multiple Files", () => {
    const a = new File(["a"], "a.txt");
    const b = new File(["b"], "b.txt");
    const c = new File(["c"], "c.txt");
    const payload = { docs: [a, b], cover: c };
    const { encoded, files } = serialize(payload);

    expect(files).toHaveLength(3);
    const result = deserialize(encoded, files) as typeof payload;
    expect(result.docs[0]).toBe(a);
    expect(result.docs[1]).toBe(b);
    expect(result.cover).toBe(c);
  });
});

// ─── Edge cases ──────────────────────────────────────────────────

describe("serialize/deserialize — edge cases", () => {
  it("handles empty object payload", () => {
    expect(roundTrip({})).toEqual({});
  });

  it("handles null payload", () => {
    expect(roundTrip(null)).toBeNull();
  });

  it("handles payload with no Files", () => {
    const payload = { name: "test", count: 5, tags: ["a", "b"] };
    const { files } = serialize(payload);
    expect(files).toHaveLength(0);
    expect(roundTrip(payload)).toEqual(payload);
  });

  it("handles payload with only Files", () => {
    const file = new File(["only"], "only.txt");
    const payload = { file };
    const { encoded, files } = serialize(payload);
    expect(files).toHaveLength(1);
    const result = deserialize(encoded, files) as typeof payload;
    expect(result.file).toBe(file);
  });

  it("throws when payload exceeds maximum nesting depth", () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 35; i++) {
      deep = { nested: deep };
    }
    expect(() => serialize(deep)).toThrow("maximum nesting depth");
  });
});
