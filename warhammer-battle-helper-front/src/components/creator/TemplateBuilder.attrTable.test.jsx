import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../../i18n';
import { makeDefaultField, PropertyPanel } from './TemplateBuilder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

test('a new attr_table starts empty, not rollable, without advances', () => {
  const f = makeDefaultField('attr_table', i18n.t.bind(i18n));
  expect(f).toMatchObject({ type: 'attr_table', attrRows: [], step: 1, hasAdvances: false, rollable: false });
  expect(f.label).toBe(i18n.t('creator.fieldType.attrTable'));
});

test('the attr_table panel shows its rows editor but no per-field default, abbr or short-card switch', () => {
  const onChange = jest.fn();
  const field = makeDefaultField('attr_table', i18n.t.bind(i18n));
  render(<PropertyPanel field={field} onChange={onChange} onDelete={jest.fn()} numberFields={[]} numericFields={[]} sections={[]} />);

  expect(screen.getByText(i18n.t('creator.attrRows'))).toBeInTheDocument();
  expect(screen.queryByLabelText(i18n.t('creator.fieldDefault'))).toBeNull();
  expect(screen.queryByLabelText(i18n.t('creator.fieldAbbr'))).toBeNull();
  expect(screen.queryByText(i18n.t('creator.showOnShortCard'))).toBeNull();

  fireEvent.click(screen.getByText(i18n.t('creator.attrRowsAdd')));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0].attrRows).toHaveLength(1);
});
