import { addOnCreateValues } from './addOnCreate';

test('add-on-create presets become rows keyed by field, ids kept, nested sections included', () => {
  const sections = [{
    id: 's', fields: [
      { key: 'weapons', type: 'weapons_table', presetWeapons: [
        { id: 'p_fists', cells: { name: 'Fists' }, damage: { d1: '3' }, addOnCreate: true },
        { id: 'p_sword', cells: { name: 'Sword' } },
      ] },
      { key: 'sub', type: 'section', section: { id: 'sub', fields: [
        { key: 'gear', type: 'data_table', presetRows: [{ id: 'p_rope', cells: { name: 'Rope' }, addOnCreate: true }] },
      ] } },
    ],
  }];
  expect(addOnCreateValues(sections)).toEqual({
    weapons: { weapons: [{ id: 'p_fists', cells: { name: 'Fists' }, damage: { d1: '3' } }] },
    tables:  { gear: [{ id: 'p_rope', cells: { name: 'Rope' } }] },
  });
});

test('no presets, no rows', () => {
  expect(addOnCreateValues([])).toEqual({ weapons: {}, tables: {} });
});
