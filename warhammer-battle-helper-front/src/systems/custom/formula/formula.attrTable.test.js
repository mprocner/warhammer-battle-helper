import { formulaRefsOf } from './formula';
import { collectFormulaFields } from '../../../components/creator/TemplateBuilder';

// TemplateBuilder pulls in the axios instance, whose ESM entry jest cannot parse.
jest.mock('axios', () => {
  const instance = { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => instance, ...instance }, create: () => instance };
});

const sections = [{ id: 's1', fields: [
  { key: 'attr_lone', type: 'attr', label: 'Szczęście' },
  { key: 'fld_t', type: 'attr_table', attrRows: [{ id: 'attr_ws', label: 'Walka', abbr: 'WW' }] },
  { key: 'num_1', type: 'number', label: 'Waga' },
] }];

test('formulaRefsOf counts table rows as attributes', () => {
  expect(formulaRefsOf(sections).attrKeys).toEqual(['attr_lone', 'attr_ws']);
});

test('collectFormulaFields offers table rows as attribute chips but counts the table as one field', () => {
  const { numberFields, numericFields, totalFieldCount } = collectFormulaFields(sections);
  expect(numberFields.map(f => f.key)).toEqual(['attr_lone', 'attr_ws']);
  expect(numericFields.map(f => f.key)).toEqual(['num_1']);
  expect(totalFieldCount).toBe(3);
});
