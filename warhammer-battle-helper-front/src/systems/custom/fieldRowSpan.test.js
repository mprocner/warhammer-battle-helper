import { fieldRowSpan } from './fieldRowSpan';

describe('fieldRowSpan', () => {
  test.each([
    ['char_avatar', 2],
    ['text_long', 2],
    ['text_short', 1],
    ['char_name', 1],
    ['number', 1],
    ['computed', 1],
    ['progress', 1],
    ['select', 1],
    ['checkbox', 1],
    ['label', 1],
    ['image', null],
    ['skill_table', null],
    ['weapons_table', null],
    ['skill_tree', null],
    ['section', null],
    ['something_new', null],
  ])('%s spans %p', (type, expected) => {
    expect(fieldRowSpan({ key: 'k', type })).toBe(expected);
  });

  test('an attribute with advances spans two rows', () => {
    expect(fieldRowSpan({ key: 'ws', type: 'attr', hasAdvances: true })).toBe(2);
  });

  test('an attribute without advances spans one row', () => {
    expect(fieldRowSpan({ key: 'ws', type: 'attr' })).toBe(1);
    expect(fieldRowSpan({ key: 'ws', type: 'attr', hasAdvances: false })).toBe(1);
  });

  test('a missing field has no span', () => {
    expect(fieldRowSpan(null)).toBeNull();
    expect(fieldRowSpan(undefined)).toBeNull();
  });

  test('attr_table follows its content height', () => {
    expect(fieldRowSpan({ type: 'attr_table', hasAdvances: true })).toBeNull();
  });
});

test('a styled long text spans four rows', () => {
  expect(fieldRowSpan({ key: 'bio', type: 'text_long', richText: true })).toBe(4);
  expect(fieldRowSpan({ key: 'bio', type: 'text_long', richText: false })).toBe(2);
});
