import { makeDefaultField, collectFormulaFields } from './TemplateBuilder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

test('a new computed field starts with an empty formula and no default', () => {
  const f = makeDefaultField('computed');
  expect(f).toMatchObject({ type: 'computed', formula: [], default: null, label: '' });
  expect(f.key).toMatch(/^computed_/);
});

test('formula sources split attributes from number fields, at any depth', () => {
  const sections = [{
    id: 's', title: '', columns: 3, fields: [
      { key: 'a1', type: 'attr' },
      { key: 'n1', type: 'number' },
      { key: 'c1', type: 'computed' },
      { key: 'sub', type: 'section', section: { id: 'sub', title: '', columns: 2, fields: [{ key: 'n2', type: 'number' }] } },
    ],
  }];
  const { numberFields, numericFields } = collectFormulaFields(sections);
  expect(numberFields.map(f => f.key)).toEqual(['a1']);
  expect(numericFields.map(f => f.key)).toEqual(['n1', 'n2']);
});
