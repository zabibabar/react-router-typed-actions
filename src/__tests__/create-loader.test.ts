import { describe, it, expect, expectTypeOf, vi } from "vitest";
import { createLoader, type Loader } from "../create-loader";

// ─── Fixtures ────────────────────────────────────────────────────

const fetchItems = vi.fn(async (ctx: { campaignId: string; token: string }) => {
  return [{ id: "1", campaign: ctx.campaignId }];
});

const itemsLoader = createLoader({
  loaderFn: fetchItems,
  loaderKey: (ctx) => ["items", ctx.campaignId],
});

const noCtxFn = vi.fn(async () => ({ status: "ok" as const }));

const statusLoader = createLoader({
  loaderFn: noCtxFn,
});

const alwaysFn = vi.fn(async (ctx: { id: string }) => ({ fresh: true }));

const alwaysLoader = createLoader({
  loaderFn: alwaysFn,
  revalidate: "always",
});

// ─── createLoader returns callable with invalidate ──────────────

describe("createLoader", () => {
  it("returns a callable function with invalidate method", () => {
    expect(typeof itemsLoader).toBe("function");
    expect(typeof itemsLoader.invalidate).toBe("function");
  });
});

// ─── Caching behavior ───────────────────────────────────────────

describe("caching", () => {
  it("calls loaderFn on first invocation", async () => {
    const fn = vi.fn(async (ctx: { id: string }) => ctx.id);
    const loader = createLoader({ loaderFn: fn, loaderKey: (ctx) => ["test", ctx.id] });

    const result = await loader({ id: "abc" });
    expect(result).toBe("abc");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns cached value on second call with same loaderKey", async () => {
    const fn = vi.fn(async (ctx: { id: string }) => ({ id: ctx.id, ts: Date.now() }));
    const loader = createLoader({ loaderFn: fn, loaderKey: (ctx) => ["cached", ctx.id] });

    const first = await loader({ id: "1" });
    const second = await loader({ id: "1" });

    expect(first).toBe(second);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("re-fetches when loaderKey changes", async () => {
    const fn = vi.fn(async (ctx: { id: string }) => ({ id: ctx.id }));
    const loader = createLoader({ loaderFn: fn, loaderKey: (ctx) => ["rekey", ctx.id] });

    const first = await loader({ id: "1" });
    const second = await loader({ id: "2" });

    expect(first).toEqual({ id: "1" });
    expect(second).toEqual({ id: "2" });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("defaults loaderKey to JSON.stringify(ctx) when not provided", async () => {
    const fn = vi.fn(async (ctx: { x: number }) => ctx.x * 2);
    const loader = createLoader({ loaderFn: fn });

    await loader({ x: 5 });
    const cached = await loader({ x: 5 });
    await loader({ x: 10 });

    expect(cached).toBe(10);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("caches void-context loaders after first call", async () => {
    const fn = vi.fn(async () => "hello");
    const loader = createLoader({ loaderFn: fn });

    await loader();
    await loader();
    await loader();

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ─── Invalidation ───────────────────────────────────────────────

describe("invalidate", () => {
  it("forces re-fetch on next call after invalidate", async () => {
    const fn = vi.fn(async (ctx: { id: string }) => ({ id: ctx.id }));
    const loader = createLoader({ loaderFn: fn, loaderKey: (ctx) => ["inv", ctx.id] });

    await loader({ id: "1" });
    expect(fn).toHaveBeenCalledTimes(1);

    loader.invalidate();
    await loader({ id: "1" });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("clears the invalidation flag after re-fetch", async () => {
    const fn = vi.fn(async (ctx: { id: string }) => ({ id: ctx.id }));
    const loader = createLoader({ loaderFn: fn, loaderKey: (ctx) => ["inv2", ctx.id] });

    await loader({ id: "1" });
    loader.invalidate();
    await loader({ id: "1" });
    await loader({ id: "1" });

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("invalidate before first call still results in a single fetch", async () => {
    const fn = vi.fn(async () => "data");
    const loader = createLoader({ loaderFn: fn });

    loader.invalidate();
    await loader();

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ─── revalidate: 'always' ───────────────────────────────────────

describe("revalidate: 'always'", () => {
  it("never caches — calls loaderFn every time", async () => {
    const fn = vi.fn(async (ctx: { id: string }) => ctx.id);
    const loader = createLoader({
      loaderFn: fn,
      loaderKey: (ctx) => ["always", ctx.id],
      revalidate: "always",
    });

    await loader({ id: "1" });
    await loader({ id: "1" });
    await loader({ id: "1" });

    expect(fn).toHaveBeenCalledTimes(3);
  });
});

// ─── Error propagation ──────────────────────────────────────────

describe("error handling", () => {
  it("propagates errors from loaderFn (raw throw, no envelope)", async () => {
    const loader = createLoader({
      loaderFn: async () => {
        throw new Error("network failure");
      },
    });

    await expect(loader()).rejects.toThrow("network failure");
  });

  it("does not cache failed results", async () => {
    let callCount = 0;
    const loader = createLoader({
      loaderFn: async () => {
        callCount++;
        if (callCount === 1) throw new Error("first fail");
        return "success";
      },
    });

    await expect(loader()).rejects.toThrow("first fail");
    const result = await loader();
    expect(result).toBe("success");
  });
});

// ─── Type tests ─────────────────────────────────────────────────

describe("type inference", () => {
  it("infers TResult from loaderFn return type", () => {
    const loader = createLoader({
      loaderFn: async (ctx: { id: string }) => ({ name: "test", id: ctx.id }),
    });

    expectTypeOf(loader).toMatchTypeOf<
      (ctx: { id: string }) => Promise<{ name: string; id: string }>
    >();
  });

  it("void-context loader is callable with no args", () => {
    const loader = createLoader({
      loaderFn: async () => 42,
    });

    expectTypeOf(loader).toMatchTypeOf<() => Promise<number>>();
  });

  it("exposes invalidate on the function object", () => {
    expectTypeOf(itemsLoader.invalidate).toEqualTypeOf<() => void>();
  });

  it("Loader type matches the callable + invalidate shape", () => {
    expectTypeOf(itemsLoader).toMatchTypeOf<
      Loader<Array<{ id: string; campaign: string }>, { campaignId: string; token: string }>
    >();
  });
});
