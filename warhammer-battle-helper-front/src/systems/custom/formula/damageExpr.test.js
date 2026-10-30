import { isValidDamageExpr } from './damageExpr';
import cases from './damage_expr_cases.json';

// Cross-language contract with the backend's parseDamageExpr (damage_expr_test.go): the sheet
// must reject exactly what the roll would reject.
describe('isValidDamageExpr agrees with damage_expr_cases.json', () => {
  test.each(cases.map(c => [JSON.stringify(c.input), c]))('%s', (_name, c) => {
    expect(isValidDamageExpr(c.input)).toBe(c.valid);
  });
});

test('null and undefined are invalid', () => {
  expect(isValidDamageExpr(null)).toBe(false);
  expect(isValidDamageExpr(undefined)).toBe(false);
});
