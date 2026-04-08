import warhammer4e from './warhammer4e';
import coc7e from './coc7e';
import dnd5e from './dnd5e';

const systems = { warhammer4e, coc7e, dnd5e };

/**
 * Returns the system module for the given game system key.
 * Falls back to warhammer4e if the key is unknown (backward compat with old games).
 */
export function getSystem(gameSystem) {
  return systems[gameSystem] || warhammer4e;
}

export function normalizeCharacter(char) {
  if (!char) return char;
  return getSystem(char.gameSystem).normalizeCharacter(char);
}

export function buildPayload(char) {
  return getSystem(char?.gameSystem).buildPayload(char);
}

export function listSystems() {
  return Object.entries(systems).map(([value, sys]) => ({ value, label: sys.label }));
}
