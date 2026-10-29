import { genId } from '../../utils/surrogateKeys';

// Creator-side mirror of models/success_levels.go (PLAYRPG-289). The roll itself is scored in Go
// (successlevel.go); tensLevel exists only for the creator's live example.
export const SL_MODE_OFF = '';
export const SL_MODE_TENS = 'tens';
export const SL_MODE_TIERS = 'tiers';

export const DEFAULT_SL_STEP = 10;
export const MAX_SL_STEP = 100;
export const MIN_TIER_DIVISOR = 2;
export const MAX_TIER_DIVISOR = 100;
export const MAX_TIER_LABEL = 40;

// Hex because <input type="color"> takes nothing else; values match LogWindow.css --log-* tokens.
export const SL_COLORS = {
  extreme: '#b8941f', // --log-gold-medium
  hard: '#5a7a4a',    // --log-green-medium
  success: '#4a7c59', // --log-success
  failure: '#c94444', // --log-red-light
};

export function tensLevel(roll, target, step) {
  const s = step > 0 ? step : DEFAULT_SL_STEP;
  return Math.floor(target / s) - Math.floor(roll / s);
}

export function defaultTiers(t) {
  return {
    success: { label: t('creator.successLevels.default.success'), color: SL_COLORS.success },
    failure: { label: t('creator.successLevels.default.failure'), color: SL_COLORS.failure },
    tiers: [
      { id: genId('tier'), divisor: 5, label: t('creator.successLevels.default.extreme'), color: SL_COLORS.extreme },
      { id: genId('tier'), divisor: 2, label: t('creator.successLevels.default.hard'), color: SL_COLORS.hard },
    ],
  };
}

export const sortTiers = tiers => [...tiers].sort((a, b) => b.divisor - a.divisor);

export function freeDivisor(tiers) {
  const used = new Set(tiers.map(x => x.divisor));
  for (let d = MIN_TIER_DIVISOR; d <= MAX_TIER_DIVISOR; d++) {
    if (!used.has(d)) return d;
  }
  return null;
}

export function isDivisorValid(divisor, tiers, ownId) {
  return Number.isInteger(divisor)
    && divisor >= MIN_TIER_DIVISOR
    && divisor <= MAX_TIER_DIVISOR
    && !tiers.some(x => x.id !== ownId && x.divisor === divisor);
}
