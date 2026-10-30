import { weaponSkillColumn, weaponRowIssue } from './weaponLayout';

const skillCol  = { key: 'c_skill', label: 'Skill', type: 'select', optionsFromSkills: true };
const textCol   = { key: 'c_name',  label: 'Name',  type: 'text' };
// A column whose type moved away from "select" but kept the flag: dead data the backend ignores.
const staleCol  = { key: 'c_old',   label: 'Old',   type: 'text', optionsFromSkills: true };
const playerDie = { id: 'b1', type: 'dice' };   // no faces -> the player fills them in

test('weaponSkillColumn needs both the select type and the flag', () => {
  expect(weaponSkillColumn({ columns: [textCol, skillCol] })).toBe(skillCol);
  expect(weaponSkillColumn({ columns: [textCol, staleCol] })).toBeNull();
  expect(weaponSkillColumn({})).toBeNull();
});

test('a complete row has no issue', () => {
  const field = { columns: [skillCol], damageFormula: [playerDie] };
  const row = { id: 'r1', cells: { c_skill: 'sk_1' }, damage: { b1: '6' } };
  expect(weaponRowIssue(field, row)).toBeNull();
});

test('an empty skill cell blocks the roll', () => {
  const field = { columns: [skillCol], damageFormula: [] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {} })).toBe('skill');
});

test('a field without a skill column stays rollable — it is a plain equipment list', () => {
  const field = { columns: [textCol], damageFormula: [] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {} })).toBeNull();
});

test('unfilled damage blocks the roll', () => {
  const field = { columns: [textCol], damageFormula: [playerDie] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {}, damage: {} })).toBe('damage');
});

test('both missing at once reports the skill first', () => {
  const field = { columns: [skillCol], damageFormula: [playerDie] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {}, damage: {} })).toBe('skill');
});

const playerExpr = { id: 'm1', type: 'const_input' };

test('a dice expression in the player field is rollable', () => {
  const field = { columns: [textCol], damageFormula: [playerExpr] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {}, damage: { m1: '1K4' } })).toBeNull();
});

test('an empty player field blocks the roll as incomplete', () => {
  const field = { columns: [textCol], damageFormula: [playerExpr] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {}, damage: { m1: '  ' } })).toBe('damage');
});

test('an invalid player field blocks the roll as invalid', () => {
  const field = { columns: [textCol], damageFormula: [playerExpr] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {}, damage: { m1: 'abc' } })).toBe('damageInvalid');
});

test('incomplete wins over invalid', () => {
  const field = { columns: [textCol], damageFormula: [playerExpr, playerDie] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {}, damage: { m1: 'abc' } })).toBe('damage');
});

test.each(['6.0', '1e1', '0'])('a player die with faces %s blocks the roll as invalid', faces => {
  const field = { columns: [textCol], damageFormula: [playerDie] };
  expect(weaponRowIssue(field, { id: 'r1', cells: {}, damage: { [playerDie.id]: faces } })).toBe('damageInvalid');
});
