export const half = (v) => Math.floor(v / 2);
export const fifth = (v) => Math.floor(v / 5);
export const numAttr = (stats, key) => stats?.attributes?.[key] ?? stats?.[key] ?? 0;
export const skillVal = (edited, skill) => {
  if (skill.key?.startsWith('custom_')) {
    const cs = (edited.customSkills || []).find(c => c.key === skill.key);
    return cs !== undefined ? (cs.value ?? cs.base ?? 0) : (skill.base ?? 0);
  }
  const stored = (edited.skills || {})[skill.key];
  return stored !== undefined ? stored : (skill.base ?? 0);
};

/**
 * Single source of truth for the 6 CoC 7e success tiers.
 *
 * Each entry fully describes one outcome:
 *  - isCritSuccess / isCritFailure / isSuccess: props that pick the <WaxSealToken />
 *    gradient class (.wax-seal-token--crit-success / --crit-failure / --success / --failure)
 *  - symbol: glyph shown inside the wax seal
 *  - label: i18n key for the result text
 *  - color: CSS custom property used for the result/roll text colour
 *  - sealColor: optional flat seal background, only for tiers that have no gradient
 *    class of their own. hard_success maps to isSuccess (green class) but should read
 *    blue, so we override its seal; every other tier keeps its gradient (sealColor null).
 *
 * CoC has more tiers than the generic 3-state getResultColor() can express
 * (hard_success vs regular_success both look "successful"), so the colour lives
 * here next to the outcome instead of being derived from boolean flags.
 */
export const OUTCOME_MAP = {
  critical_success: { isCritSuccess: true,  isCritFailure: false, isSuccess: true,  symbol: '★', label: 'coc.criticalSuccess', color: 'var(--log-gold-medium)', sealColor: null            },
  extreme_success:  { isCritSuccess: true,  isCritFailure: false, isSuccess: true,  symbol: '◆', label: 'coc.extremeSuccess',  color: 'var(--log-gold-medium)', sealColor: null            },
  hard_success:     { isCritSuccess: false, isCritFailure: false, isSuccess: true,  symbol: '▲', label: 'coc.hardSuccess',     color: 'var(--log-blue)',        sealColor: 'var(--log-blue)' },
  regular_success:  { isCritSuccess: false, isCritFailure: false, isSuccess: true,  symbol: '●', label: 'coc.regularSuccess',  color: 'var(--log-success)',     sealColor: null            },
  failure:          { isCritSuccess: false, isCritFailure: false, isSuccess: false, symbol: '✕', label: 'coc.failure',         color: 'var(--log-red-light)',   sealColor: null            },
  fumble:           { isCritSuccess: false, isCritFailure: true,  isSuccess: false, symbol: '☠', label: 'coc.fumble',          color: 'var(--log-purple)',      sealColor: null            },
};

/**
 * Resolve an outcome key to its config, falling back to `failure` for
 * unknown/missing values so callers never have to null-check.
 */
export const getOutcomeConfig = (outcome) => OUTCOME_MAP[outcome] || OUTCOME_MAP.failure;
