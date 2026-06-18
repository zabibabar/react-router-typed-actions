// ─── Types ────────────────────────────────────────────────────────

export interface CreateLoaderConfig<TResult, TContext = void> {
  loaderFn: (ctx: TContext) => Promise<TResult>;
  loaderKey?: (ctx: TContext) => readonly unknown[];
  revalidate?: "cache" | "always";
}

export type Loader<TResult, TContext = void> = ([TContext] extends [void]
  ? () => Promise<TResult>
  : (ctx: TContext) => Promise<TResult>) & {
  invalidate(): void;
};

// ─── createLoader ─────────────────────────────────────────────────

export function createLoader<TResult, TContext = void>(
  config: CreateLoaderConfig<TResult, TContext>,
): Loader<TResult, TContext> {
  let _shouldRefetch = false;
  let _cache: { key: string; value: TResult } | null = null;

  const loader = (async (ctx: TContext): Promise<TResult> => {
    const key = config.loaderKey
      ? JSON.stringify(config.loaderKey(ctx))
      : (JSON.stringify(ctx) ?? "");

    if (
      !_shouldRefetch &&
      _cache &&
      _cache.key === key &&
      config.revalidate !== "always"
    ) {
      return _cache.value;
    }

    _shouldRefetch = false;
    const value = await config.loaderFn(ctx);
    _cache = { key, value };
    return value;
  }) as Loader<TResult, TContext>;

  loader.invalidate = () => {
    _shouldRefetch = true;
  };

  return loader;
}
