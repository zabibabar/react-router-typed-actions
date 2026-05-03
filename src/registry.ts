import { getDefinitionFor, type ActionCreator, type ActionDefinition } from "./define-action";

const _globalRegistry = new Map<string, ActionDefinition>();

export function registerActions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  creators: ActionCreator<string, any, any, any, any>[],
): string[] {
  const contributedTypes: string[] = [];

  for (const creator of creators) {
    const def = getDefinitionFor(creator);
    if (!def) {
      throw new Error(
        `react-router-actions: ActionCreator "${creator.type}" is missing its definition. ` +
          "Only creators produced by defineAction() can be registered.",
      );
    }
    if (_globalRegistry.has(creator.type)) {
      throw new Error(
        `react-router-actions: Duplicate action type "${creator.type}" — ` +
          `already registered by another ActionsProvider.`,
      );
    }
    _globalRegistry.set(creator.type, def);
    contributedTypes.push(creator.type);
  }

  return contributedTypes;
}

export function unregisterActions(types: string[]): void {
  for (const type of types) {
    _globalRegistry.delete(type);
  }
}

export function getDefinition(type: string): ActionDefinition {
  const def = _globalRegistry.get(type);
  if (!def) {
    throw new Error(
      `react-router-actions: Unknown action type "${type}". ` +
        "Ensure an ActionsProvider registering this action is mounted.",
    );
  }
  return def;
}
