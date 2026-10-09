// progressRatio is the filled share of a progress field, clamped to 0..1, and whether it is low
// (a quarter or less of a non-zero maximum). The sheet tile and the short card draw the same
// strip from it, so the two never disagree about how full a field is or when it turns red.
export function progressRatio(current, max) {
  const m = Number(max) || 0;
  const ratio = m > 0 ? Math.min(1, Math.max(0, (Number(current) || 0) / m)) : 0;
  return { ratio, low: m > 0 && ratio <= 0.25 };
}
