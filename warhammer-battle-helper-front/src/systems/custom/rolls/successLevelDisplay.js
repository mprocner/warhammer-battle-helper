// Turns the success data the backend snapshotted into the event (PLAYRPG-289, successlevel.go)
// into the log's result line. The log never consults the template: a GM editing tiers later
// must not rewrite history.
const MINUS = '−';

export function successLevelDisplay(data, outcomeLabel, t) {
  if (data.tierLabel || data.tierColor) {
    return { label: data.tierLabel || outcomeLabel, color: data.tierColor || null };
  }
  if (data.hasSuccessLevel) {
    const level = data.successLevel || 0;
    // Level 0 happens on both sides of the target; only the outcome says which.
    const negative = level < 0 || (level === 0 && data.outcome === 'failure');
    return {
      label: `${outcomeLabel} · ${negative ? MINUS : '+'}${Math.abs(level)} ${t('customRoll.slAbbr')}`,
      color: null,
    };
  }
  return null;
}
