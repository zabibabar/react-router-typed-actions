import superjson from "superjson";

const FILE_SENTINEL = "__file" as const;

export interface FileEntry {
  path: string;
  file: File | Blob;
}

export interface SerializeResult {
  encoded: string;
  files: FileEntry[];
}

function joinPath(parent: string, key: string | number): string {
  return parent ? `${parent}.${key}` : String(key);
}

function isFileLike(value: unknown): value is File | Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isFileSentinel(
  value: unknown,
): value is { [FILE_SENTINEL]: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    FILE_SENTINEL in value &&
    typeof (value as Record<string, unknown>)[FILE_SENTINEL] === "string"
  );
}

function extractFiles(
  value: unknown,
  path: string,
  files: FileEntry[],
): unknown {
  if (value == null || typeof value !== "object") return value;

  if (isFileLike(value)) {
    files.push({ path, file: value });
    return { [FILE_SENTINEL]: path };
  }

  if (Array.isArray(value)) {
    return value.map((item, i) =>
      extractFiles(item, joinPath(path, i), files),
    );
  }

  if (value instanceof Map) {
    const result = new Map();
    for (const [k, v] of value) {
      result.set(k, extractFiles(v, joinPath(path, `_map_${String(k)}`), files));
    }
    return result;
  }

  if (value instanceof Set) {
    const arr: unknown[] = [];
    let i = 0;
    for (const v of value) {
      arr.push(extractFiles(v, joinPath(path, `_set_${i}`), files));
      i++;
    }
    return new Set(arr);
  }

  if (value instanceof Date || value instanceof RegExp) return value;

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    result[key] = extractFiles(
      (value as Record<string, unknown>)[key],
      joinPath(path, key),
      files,
    );
  }
  return result;
}

function reinsertFiles(
  value: unknown,
  fileMap: Map<string, File | Blob>,
): unknown {
  if (value == null || typeof value !== "object") return value;

  if (isFileSentinel(value)) {
    return fileMap.get(value[FILE_SENTINEL]) ?? value;
  }

  if (isFileLike(value)) return value;

  if (Array.isArray(value)) {
    return value.map((item) => reinsertFiles(item, fileMap));
  }

  if (value instanceof Map) {
    const result = new Map();
    for (const [k, v] of value) {
      result.set(k, reinsertFiles(v, fileMap));
    }
    return result;
  }

  if (value instanceof Set) {
    const result = new Set();
    for (const v of value) {
      result.add(reinsertFiles(v, fileMap));
    }
    return result;
  }

  if (value instanceof Date || value instanceof RegExp) return value;

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    result[key] = reinsertFiles(
      (value as Record<string, unknown>)[key],
      fileMap,
    );
  }
  return result;
}

export function serialize(payload: unknown): SerializeResult {
  const files: FileEntry[] = [];
  const sanitized = extractFiles(payload, "", files);
  const encoded = superjson.stringify(sanitized);
  return { encoded, files };
}

export function deserialize(
  encoded: string,
  files: ReadonlyArray<FileEntry>,
): unknown {
  const parsed = superjson.parse(encoded);
  if (files.length === 0) return parsed;

  const fileMap = new Map<string, File | Blob>();
  for (const entry of files) {
    fileMap.set(entry.path, entry.file);
  }
  return reinsertFiles(parsed, fileMap);
}
