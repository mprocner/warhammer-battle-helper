import cases from './formula_cases.json';
import { parseFormula, evaluateArithmetic, validateFormula, computeFieldValue } from './formula';

const toAttributes = (attrs = {}) =>
  Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, { current: v }]));

// The same file drives formula_test.go: the two parsers must agree on every value, and on
// every error's reason AND block index.
describe('formula_cases.json (shared with the Go parser)', () => {
  test.each(cases.map(c => [c.name, c]))('%s', (_name, c) => {
    const parsed = parseFormula(c.blocks);
    let outcome = parsed;
    if (parsed.ok && !c.expect.valid) {
      outcome = evaluateArithmetic(parsed.tree, { attributes: toAttributes(c.attributes), numbers: c.numbers || {} });
    }
    if (c.expect.error) {
      // eslint-disable-next-line jest/no-conditional-expect
      expect(outcome.ok).toBe(false);
      // eslint-disable-next-line jest/no-conditional-expect
      expect(outcome.error).toEqual({ reason: c.expect.error, index: c.expect.index });
      return;
    }
    expect(outcome.ok).toBe(true);
    // toBe uses Object.is, so a -0 leaking out of Math.trunc fails here.
    // eslint-disable-next-line jest/no-conditional-expect
    if (c.expect.value !== undefined) expect(outcome.value).toBe(c.expect.value);
  });
});

const attr = (key) => ({ type: 'attr', key, label: key });
const num = (key) => ({ type: 'number', key, label: key });
const c = (n) => ({ type: 'const', num: n });
const op = (v) => ({ type: 'op', value: v });

describe('validateFormula', () => {
  it('names a missing field by its label', () => {
    const v = validateFormula([attr('gone')], { attrKeys: ['str'] });
    expect(v).toMatchObject({ valid: false, errorKey: 'creator.formula.error.field_not_found', errorParams: { label: 'gone' }, index: 0 });
  });

  it('checks number blocks against number fields, not attributes', () => {
    expect(validateFormula([num('load')], { attrKeys: ['load'] }).valid).toBe(false);
    expect(validateFormula([num('load')], { numberKeys: ['load'] }).valid).toBe(true);
  });

  it('rejects dice and roll-context blocks in arithmetic-only mode', () => {
    const v = validateFormula([c(2), op('+'), { type: 'dice', value: 'd6' }], { arithmeticOnly: true });
    expect(v).toMatchObject({ valid: false, errorKey: 'creator.formula.error.not_allowed', index: 2 });
    expect(validateFormula([{ type: 'skill' }], { arithmeticOnly: true }).valid).toBe(false);
  });

  it('allows dice outside arithmetic-only mode', () => {
    expect(validateFormula([c(2), op('d'), { type: 'dice', value: 'd6' }], {}).valid).toBe(true);
  });

  it('reports parse errors with their reason key and index', () => {
    expect(validateFormula([c(1), op('+')], {})).toMatchObject({ valid: false, errorKey: 'creator.formula.error.unexpected_end', index: 2 });
  });
});

describe('computeFieldValue', () => {
  const refs = { attrKeys: ['str', 'dex'], numberKeys: ['load'] };
  const values = { attributes: { str: { current: 40 } }, numbers: { load: 12 } };
  const field = (formula, dflt = null) => ({ type: 'computed', formula, default: dflt });

  it('computes from live values', () => {
    expect(computeFieldValue(field([attr('str'), op('+'), num('load')]), values, refs)).toBe(52);
  });

  it('reads a field the character has not filled yet as zero', () => {
    expect(computeFieldValue(field([attr('str'), op('+'), attr('dex')], 5), values, refs)).toBe(40);
  });

  it('falls back to the default when a field was removed from the template', () => {
    expect(computeFieldValue(field([attr('str'), op('+'), attr('bonus')], 5), values, refs)).toBe(5);
  });

  it('falls back to the default on division by zero', () => {
    expect(computeFieldValue(field([attr('str'), op('/'), attr('dex')], 5), values, refs)).toBe(5);
  });

  it('falls back to the default on an empty formula', () => {
    expect(computeFieldValue(field([], 5), values, refs)).toBe(5);
  });

  it('is null without a default', () => {
    expect(computeFieldValue(field([]), values, refs)).toBeNull();
  });
});
