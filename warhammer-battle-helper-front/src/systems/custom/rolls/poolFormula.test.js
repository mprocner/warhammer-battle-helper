import { flattenPoolDice, formatPoolFormula } from './poolFormula';

// Stand-in for i18next's t, parameterized by the die letter so tests can
// prove the rendered formula tracks the locale rather than a hardcoded letter.
const makeT = (letter) => (key, opts) => (key === 'dice.dieNotation' ? letter : `${letter}${opts.sides}`);
const t = makeT('K'); // Polish notation
const tEn = makeT('D'); // English notation

describe('flattenPoolDice', () => {
  test('returns one entry per die, carrying that die\'s face count', () => {
    const formula = [
      { kind: 'dice', sides: 6, rolls: [4] },
      { kind: 'text', text: '+' },
      { kind: 'dice', sides: 10, rolls: [7, 2] },
    ];
    expect(flattenPoolDice(formula)).toEqual([
      { value: 4, sides: 6 },
      { value: 7, sides: 10 },
      { value: 2, sides: 10 },
    ]);
  });

  test('expands a count term into one entry per roll', () => {
    const formula = [{ kind: 'dice', sides: 6, countLabel: '3', rolls: [4, 6, 2] }];
    expect(flattenPoolDice(formula)).toEqual([
      { value: 4, sides: 6 },
      { value: 6, sides: 6 },
      { value: 2, sides: 6 },
    ]);
  });

  test('returns an empty list for a missing formula', () => {
    expect(flattenPoolDice(undefined)).toEqual([]);
  });
});

describe('formatPoolFormula', () => {
  test('joins literal dice and operators', () => {
    const formula = [
      { kind: 'dice', sides: 6, rolls: [4] },
      { kind: 'text', text: '+' },
      { kind: 'dice', sides: 10, rolls: [7] },
      { kind: 'text', text: '+' },
      { kind: 'dice', sides: 10, rolls: [2] },
    ];
    expect(formatPoolFormula(formula, t)).toBe('K6+K10+K10');
    expect(formatPoolFormula(formula, tEn)).toBe('D6+D10+D10');
  });

  test('keeps the multiplier in front of the die', () => {
    const formula = [{ kind: 'dice', sides: 6, countLabel: '3', rolls: [4, 6, 2] }];
    expect(formatPoolFormula(formula, t)).toBe('3K6');
  });

  test('shows the source expression when the face count is computed', () => {
    const formula = [
      { kind: 'dice', sides: 8, sidesLabel: 'STR', rolls: [4] },
      { kind: 'text', text: '+' },
      { kind: 'text', text: '2' },
    ];
    expect(formatPoolFormula(formula, t)).toBe('K(STR)+2');
    expect(formatPoolFormula(formula, tEn)).toBe('D(STR)+2');
  });

  test('returns an empty string for a missing formula', () => {
    expect(formatPoolFormula(undefined, t)).toBe('');
  });
});
