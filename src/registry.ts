import { getDefinitionFor, type Action, type ActionDefinition } from "./define-action";

interface RegistryEntry {
  definition: ActionDefinition;
  sliceName: string;
}

const _globalRegistry = new Map<string, RegistryEntry>();

export function registerSlice(
  sliceName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- existential erasure: heterogeneous array of differently-typed actions
  creators: Action<string, any, any, any, any>[],
): void {
  // 1. Validate all creators before mutating the registry
  const pending: { type: string; definition: ActionDefinition }[] = [];

  for (const creator of creators) {
    const def = getDefinitionFor(creator);
    if (!def) {
      throw new Error(
        `react-router-actions: Action "${creator.type}" is missing its definition. ` +
          "Only creators produced by defineAction() can be registered.",
      );
    }

    // Duplicate type within the same array
    if (pending.some((p) => p.type === creator.type)) {
      throw new Error(
        `react-router-actions: Duplicate action type "${creator.type}" within slice "${sliceName}".`,
      );
    }

    // Duplicate type across a different slice
    const existing = _globalRegistry.get(creator.type);
    if (existing && existing.sliceName !== sliceName) {
      throw new Error(
        `react-router-actions: Action type "${creator.type}" is already registered ` +
          `by slice "${existing.sliceName}". Each action type must be unique across slices.`,
      );
    }

    pending.push({ type: creator.type, definition: def });
  }

  // 2. Clear all entries belonging to this slice (HMR-safe overwrite)
  for (const [type, entry] of _globalRegistry) {
    if (entry.sliceName === sliceName) {
      _globalRegistry.delete(type);
    }
  }

  // 3. Register the new entries
  for (const { type, definition } of pending) {
    _globalRegistry.set(type, { definition, sliceName });
  }
}

export function getDefinition(type: string): ActionDefinition {
  const entry = _globalRegistry.get(type);
  if (!entry) {
    throw new Error(
      `react-router-actions: Unknown action type "${type}". ` +
        "Ensure a registerSlice() call including this action has executed.",
    );
  }
  return entry.definition;
}

/** @internal Test-only — clears the global registry between test runs. */
export function _resetRegistryForTesting(): void {
  _globalRegistry.clear();
}
