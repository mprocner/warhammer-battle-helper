import { duplicateFieldInSections } from './templateFields';

const sections = () => [
  {
    id: 'section_1',
    title: 'Attributes',
    columns: 3,
    fields: [
      { key: 'attr_1', type: 'attr', label: 'Siła', abbr: 'S', min: 0, max: 100 },
      {
        key: 'weap_1',
        type: 'weapons_table',
        label: '',
        abbr: '',
        columns: [{ key: 'col_1', label: 'Obrażenia', type: 'text', options: [] }],
        presetWeapons: [{ id: 'preset_1', cells: {}, damage: {}, alwaysOn: false }],
      },
      { key: 'num_1', type: 'number', label: 'Ruch', abbr: 'Ru' },
    ],
  },
  { id: 'section_2', title: 'Skills', columns: 2, fields: [] },
];

const opts = { newKey: 'attr_new', copySuffix: '(kopia)' };

describe('duplicateFieldInSections', () => {
  it('inserts the copy right after the original', () => {
    const next = duplicateFieldInSections(sections(), 0, 0, opts);
    expect(next[0].fields.map(f => f.key)).toEqual(['attr_1', 'attr_new', 'weap_1', 'num_1']);
  });

  it('gives the copy the new key and leaves the original key alone', () => {
    const next = duplicateFieldInSections(sections(), 0, 0, opts);
    expect(next[0].fields[0].key).toBe('attr_1');
    expect(next[0].fields[1].key).toBe('attr_new');
  });

  it('copies every other property of the field', () => {
    const next = duplicateFieldInSections(sections(), 0, 0, opts);
    expect(next[0].fields[1]).toMatchObject({ type: 'attr', abbr: 'S', min: 0, max: 100 });
  });

  it('appends the copy suffix to a non-empty label', () => {
    const next = duplicateFieldInSections(sections(), 0, 0, opts);
    expect(next[0].fields[1].label).toBe('Siła (kopia)');
  });

  it('leaves an empty label empty', () => {
    const next = duplicateFieldInSections(sections(), 0, 1, { ...opts, newKey: 'weap_new' });
    expect(next[0].fields[2].label).toBe('');
  });

  it('keeps nested ids verbatim', () => {
    const next = duplicateFieldInSections(sections(), 0, 1, { ...opts, newKey: 'weap_new' });
    expect(next[0].fields[2].columns[0].key).toBe('col_1');
    expect(next[0].fields[2].presetWeapons[0].id).toBe('preset_1');
  });

  it('deep clones so mutating the copy never touches the original', () => {
    const next = duplicateFieldInSections(sections(), 0, 1, { ...opts, newKey: 'weap_new' });
    const original = next[0].fields[1];
    const copy = next[0].fields[2];
    expect(copy.columns).not.toBe(original.columns);
    copy.columns.push({ key: 'col_2', label: 'Zasięg', type: 'text', options: [] });
    expect(original.columns).toHaveLength(1);
  });

  it('leaves other sections untouched', () => {
    const input = sections();
    const next = duplicateFieldInSections(input, 0, 0, opts);
    expect(next[1]).toEqual(input[1]);
    expect(next[0].fields).toHaveLength(4);
  });

  it('returns the input untouched for an out-of-range index', () => {
    const input = sections();
    expect(duplicateFieldInSections(input, 5, 0, opts)).toBe(input);
    expect(duplicateFieldInSections(input, 0, 9, opts)).toBe(input);
  });
});
