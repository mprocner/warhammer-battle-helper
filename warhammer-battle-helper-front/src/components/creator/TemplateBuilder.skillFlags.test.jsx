import { skillDisplayFlags } from './TemplateBuilder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

test('a table offers all four display flags', () => {
  expect(skillDisplayFlags('skill_table'))
    .toEqual(['hideFavorites', 'showDevelopment', 'sortAlphabetically', 'twoColumns']);
});

test('a tree offers them too — its two-column split works by branch', () => {
  expect(skillDisplayFlags('skill_tree'))
    .toEqual(['hideFavorites', 'showDevelopment', 'sortAlphabetically', 'twoColumns']);
});

test('any other field type gets no display group at all', () => {
  expect(skillDisplayFlags('attr')).toEqual([]);
  expect(skillDisplayFlags('weapons_table')).toEqual([]);
});
