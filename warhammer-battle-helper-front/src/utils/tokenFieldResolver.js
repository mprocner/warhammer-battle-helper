// Resolves a token-display FieldBinding to a live value on a normalized character
// (FEATURE-102). The one place that knows the hardcoded-vs-custom `stats` shape
// asymmetry: each system module exports statsRoot(character) telling us where its
// `stats` subdocument lives on the normalized object (top level for hardcoded systems,
// nested under `.stats` for custom). Binding keys are always relative to that root.

import { getSystem } from '../systems/registry';

// getByPath walks a dot path (e.g. "wounds.current") into an object, tolerating gaps.
export function getByPath(root, path) {
  if (!root || !path) return undefined;
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), root);
}

// statsRootFor returns the `stats` root of a normalized character for its system.
export function statsRootFor(character) {
  if (!character) return undefined;
  const sys = getSystem(character.gameSystem);
  return sys.statsRoot ? sys.statsRoot(character) : character;
}

// resolveField reads { value, max } for a binding. max is only present for progress
// bindings (HP bar). Returns undefined value when the field is missing (e.g. a
// gridOnly character with no stats, or a binding to a since-removed field).
export function resolveField(character, binding) {
  if (!binding) return { value: undefined, max: undefined };
  const root = statsRootFor(character);
  return {
    value: getByPath(root, binding.key),
    max: binding.maxKey ? getByPath(root, binding.maxKey) : undefined,
  };
}
