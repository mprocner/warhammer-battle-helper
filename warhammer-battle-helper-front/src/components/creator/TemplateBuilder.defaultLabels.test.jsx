import i18n from '../../i18n';
import { makeDefaultField } from './TemplateBuilder';

// Importing TemplateBuilder pulls in api/axios and, through the system registry, axios itself —
// the ESM import jest cannot parse. Mocking the instance is enough to load the module.
jest.mock('axios', () => {
  const inst = { get: jest.fn(), post: jest.fn(), put: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } };
  return { __esModule: true, default: { create: () => inst, ...inst } };
});

const t = i18n.t.bind(i18n);

// A fresh field carries its type's name as a real, stored label: an empty label leaves a bare
// tile on the sheet and a blank entry in every field picker (formula builder, token display).
test.each([
  ['char_name',   'creator.fieldType.charName'],
  ['char_avatar', 'creator.fieldType.charAvatar'],
  ['image',       'creator.fieldType.image'],
  ['number',      'creator.fieldType.number'],
  ['text_short',  'creator.fieldType.textShort'],
  ['skill_table', 'creator.fieldType.skillTable'],
])('a new %s field is labelled with its type name', (type, key) => {
  const label = makeDefaultField(type, t).label;
  expect(label).toBe(t(key));
  expect(label).not.toBe('');
});

test('a section wrapper keeps an empty label — sections show their title, not a label', () => {
  expect(makeDefaultField('section', t).label).toBe('');
});

test('sub-labels come from translations, not hardcoded Polish', () => {
  expect(makeDefaultField('attr', t).advancesLabel).toBe(t('creator.fieldAdvancesDefault'));
  expect(makeDefaultField('skill_table', t).advancesLabel).toBe(t('creator.fieldAdvancesDefault'));
  expect(makeDefaultField('skill_tree', t).tree.label).toBe(t('creator.treeDefaultRoot'));
  expect(t('creator.treeDefaultRoot')).not.toBe('creator.treeDefaultRoot');
});
