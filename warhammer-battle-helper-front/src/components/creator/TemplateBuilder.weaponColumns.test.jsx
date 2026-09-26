import { updateWeaponColumns, weaponThresholdHint } from './TemplateBuilder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const cols = () => ([
  { key: 'a', label: 'Melee',  type: 'select', options: [], optionsFromSkills: true },
  { key: 'b', label: 'Ranged', type: 'select', options: [], optionsFromSkills: false },
]);

test('flagging a second column clears the first', () => {
  const next = updateWeaponColumns(cols(), 1, { optionsFromSkills: true });
  expect(next[0].optionsFromSkills).toBe(false);
  expect(next[1].optionsFromSkills).toBe(true);
});

test('leaving the select type clears the flag instead of leaving dead data', () => {
  const next = updateWeaponColumns(cols(), 0, { type: 'text' });
  expect(next[0].optionsFromSkills).toBe(false);
});

test('an unrelated edit leaves the roles alone', () => {
  const next = updateWeaponColumns(cols(), 1, { label: 'Bows' });
  expect(next[0].optionsFromSkills).toBe(true);
  expect(next[1].label).toBe('Bows');
});

test('the input array is not mutated', () => {
  const before = cols();
  updateWeaponColumns(before, 1, { optionsFromSkills: true });
  expect(before[0].optionsFromSkills).toBe(true);
});

test('with a skill column the hint names it', () => {
  expect(weaponThresholdHint('Melee', 'below_threshold'))
    .toEqual({ key: 'creator.weaponThresholdFromSkill', column: 'Melee', warning: false });
});

test('a raw roll has no threshold, so a present column needs no hint', () => {
  expect(weaponThresholdHint('Melee', 'raw')).toBeNull();
});

test('no skill column warns about the threshold and the formula', () => {
  expect(weaponThresholdHint(null, 'above_threshold'))
    .toEqual({ key: 'creator.weaponThresholdNoSkillColumn', warning: true });
});

test('no skill column on a raw roll warns about the formula only', () => {
  expect(weaponThresholdHint(null, 'raw'))
    .toEqual({ key: 'creator.weaponNoSkillColumnRaw', warning: true });
});
