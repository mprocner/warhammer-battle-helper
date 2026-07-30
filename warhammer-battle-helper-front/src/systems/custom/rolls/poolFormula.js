// Rendering helpers for a custom-system dice-pool result. The backend sends the
// formula as parts — text fragments and die terms carrying their own rolls — so the
// dice row and the formula line can never disagree on how many faces a die had.

// flattenPoolDice returns one entry per rolled die, in roll order, each tagged with
// the face count of the die that produced it.
export function flattenPoolDice(poolFormula) {
  if (!poolFormula) return [];
  return poolFormula.flatMap(part =>
    (part.rolls || []).map(value => ({ value, sides: part.sides }))
  );
}

// formatPoolFormula renders the formula line, e.g. "K6+K10+K10", "3K6", "K(STR)+2".
// The die letter comes from i18n, so the line reads K in Polish and D in English.
export function formatPoolFormula(poolFormula, t) {
  if (!poolFormula) return '';
  return poolFormula
    .map(part => {
      if (part.kind !== 'dice') return part.text || '';
      const count = part.countLabel || '';
      return part.sidesLabel
        ? `${count}${t('dice.dieNotation')}(${part.sidesLabel})`
        : `${count}${t('dice.label', { sides: part.sides })}`;
    })
    .join('');
}
