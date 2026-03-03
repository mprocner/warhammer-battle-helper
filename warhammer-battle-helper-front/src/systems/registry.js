import warhammer4e from './warhammer4e';
import coc7e from './coc7e';

const systems = { warhammer4e, coc7e };

/**
 * Returns the system module for the given game system key.
 * Falls back to warhammer4e if the key is unknown (backward compat with old games).
 */
export function getSystem(gameSystem) {
  return systems[gameSystem] || warhammer4e;
}
