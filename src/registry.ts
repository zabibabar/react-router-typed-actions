import { getDefinitionFor, type Action, type ActionDefinition } from "./define-action";

const _globalRegistry = new Map<string, ActionDefinition>();

export function registerActions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry stores heterogeneous action creators
  creators: readonly Action<string, any, any, any, any>[],
): void {
  const seen = new Set<string>();

  for (const creator of creators) {
    const def = getDefinitionFor(creator);
    if (!def) {
      throw new Error(
        `react-router-actions: Action "${creator.type}" is missing its definition. ` +
          "Only creators produced by defineAction() can be registered.",
      );
    }

    if (seen.has(creator.type)) {
      throw new Error(
        `react-router-actions: Duplicate action type "${creator.type}" in registerActions() call.`,
      );
    }
    seen.add(creator.type);

    _globalRegistry.set(creator.type, def);
  }
}

export function getDefinition(type: string): ActionDefinition {
  const def = _globalRegistry.get(type);
  if (!def) {
    throw new Error(
      `react-router-actions: Unknown action type "${type}". ` +
        "Ensure a registerActions() call including this action has executed.",
    );
  }
  return def;
}

/** @internal Test-only — clears the global registry between test runs. */
export function _resetRegistryForTesting(): void {
  _globalRegistry.clear();
}
