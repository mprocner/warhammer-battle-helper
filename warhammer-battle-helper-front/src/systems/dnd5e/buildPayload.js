// Strip the `derived` field before sending to the backend — it is recomputed server-side.
export function buildPayload(char) {
  if (!char || !char.stats) return char;
  const { derived: _derived, ...statsRest } = char.stats;
  return { ...char, stats: statsRest };
}
