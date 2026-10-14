import warhammer4e from './warhammer4e';
import coc7e from './coc7e';
import coc7e_dark_ages from './coc7e_dark_ages';
import srd5 from './srd5';
import custom from './custom';

// Display names are NOT part of a system module: they live only in i18n as
// gameSystems.<key> (en + pl), so renaming a system is a translation edit with no data
// migration. A new system needs that key in both languages (registry.labels.test.js).
const systems = { warhammer4e, coc7e, coc7e_dark_ages, srd5, custom };

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
  return Object.keys(systems).map(value => ({ value }));
}
