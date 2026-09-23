import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

// Characterization test for FEATURE-214. The creator gains an optional `renderChrome` seam;
// without it the markup must stay byte-for-byte what the session renders today, because this
// component draws every custom character sheet in every game.
//
// Text-and-role queries cannot catch a stray wrapper: the grid children of
// `.custom-sheet__fields--N-col` ARE the fields, so one extra div silently turns the wrapper
// into the grid cell and the column maths stops applying to what the player sees. Only the DOM
// shape itself shows that.
//
// These snapshots are taken BEFORE the seam is added. Never refresh them while adding the seam —
// a snapshot refreshed alongside the change it is meant to police proves nothing.
const sections = [
  { id: 'sec_root', title: 'Cechy', columns: 3, fields: [
    { key: 'attr_ws', type: 'attr', label: 'Walka wręcz', abbr: 'WW', min: 1, max: 100, rollable: true },
    { key: 'attr_bs', type: 'attr', label: 'Umiejętności strzeleckie', abbr: 'US', hasAdvances: true, rollable: true },
    { key: 'num_gold', type: 'number', label: 'Złoto', step: 1 },
    { key: 'lbl_note', type: 'label', text: 'Notatka' },
    { key: 'txt_name', type: 'text_short', label: 'Imię' },
    { key: 'txt_bio', type: 'text_long', label: 'Historia' },
    { key: 'chk_dead', type: 'checkbox', label: 'Martwy' },
    { key: 'sel_race', type: 'select', label: 'Rasa', options: ['Człowiek', 'Elf'] },
    { key: 'prg_hp', type: 'progress', label: 'Rany', max: 20 },
  ] },
  { id: 'sec_gear', title: 'Ekwipunek', columns: 2, fields: [
    { key: 'sec_weapons', type: 'section', label: '', section: {
      id: 'sec_weapons', title: 'Broń', columns: 1, fields: [
        { key: 'wpn_table', type: 'weapons_table', label: 'Bronie',
          columns: [{ key: 'name', label: 'Nazwa', type: 'text' }], rows: [] },
      ],
    } },
    { key: 'tbl_skills', type: 'skill_table', label: 'Umiejętności podstawowe',
      skills: [{ id: 'sk_climb', label: 'Wspinaczka' }], rollable: true },
    { key: 'tree_skills', type: 'skill_tree', label: 'Umiejętności zaawansowane', rollable: true,
      playerCanAddSkills: true,
      tree: { key: 'root', children: [{ key: 'n1', label: 'Skradanie', children: [], linkedAttr: '' }] } },
  ] },
];

const values = {
  attributes: { attr_ws: 35, attr_bs: 28 },
  skills: {},
  texts: { txt_name: 'Gunther', txt_bio: 'Długa historia' },
  progress: { prg_hp: { current: 8, max: 20 } },
  numbers: { num_gold: 12 },
  weapons: { wpn_table: [{ id: 'row_1', name: 'Miecz' }] },
};

// Mirrors CharacterSheet.jsx:333-359 — the call the player's sheet actually makes. Anything
// gated on a callback being present (roll buttons, favourite stars, the add-skill form) only
// renders on this path, and those are exactly the affordances a stray wrapper would sit next to.
const sessionProps = {
  values,
  onChange: {
    attr: () => {}, advances: () => {}, skill: () => {}, skillAdvances: () => {},
    text: () => {}, progress: () => {}, number: () => {},
    weaponAdd: () => {}, weaponAddFromPreset: () => {}, weaponRemove: () => {},
    weaponCell: () => {}, weaponDamage: () => {}, weaponFavorite: () => {},
  },
  onRoll: () => {},
  favoriteWeapons: [],
  customSkillNodes: {},
  onAddCustomSkill: () => {},
  onUpdateCustomSkill: () => {},
  onRemoveCustomSkill: () => {},
  favoriteSkills: [],
  onToggleFavorite: () => {},
};

// Exactly the classes a field renderer can put at the root of a grid cell, as whole class
// tokens. Membership, not a prefix match: `\b` in a regex treats a hyphen as a boundary, so a
// prefix pattern would accept `custom-sheet__field-chrome` — and BEM sub-element names of that
// shape (custom-sheet__field-label, custom-sheet__section-title) are this codebase's own
// convention, making it the likeliest name for the very wrapper this check must catch.
const CELL_ROOTS = ['custom-sheet__field', 'custom-sheet__attr', 'custom-sheet__section'];

describe('CustomSheetBody DOM shape', () => {
  test('session render (all callbacks) is unchanged', () => {
    const { container } = render(<CustomSheetBody sections={sections} {...sessionProps} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  test('read-only render (creator preview) is unchanged', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  test('the session render really does include the callback-gated affordances', () => {
    const { container } = render(<CustomSheetBody sections={sections} {...sessionProps} />);
    // Guards the fixture itself. Each of these renders only when a callback is supplied, so if
    // any falls to zero the snapshots above have quietly stopped covering the interactive parts
    // of the sheet — which is how the first version of this file managed to cover none of them.
    expect(container.querySelectorAll('.custom-sheet__roll-btn').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.coc-star-btn').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.custom-sheet__weapon-add-btn').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.custom-sheet__skill-tree-add-btn').length).toBeGreaterThan(0);
  });

  test('each grid holds exactly its fields as direct children, and nothing else', () => {
    const { container } = render(<CustomSheetBody sections={sections} {...sessionProps} />);
    const rootGrid = container.querySelector('.custom-sheet__fields--3-col');
    const gearGrid = container.querySelector('.custom-sheet__fields--2-col');

    // Catches a wrapper that swallows several fields into one cell, and any element added
    // alongside the fields. It cannot catch a wrapper around a SINGLE field — that replaces the
    // field as the direct child and leaves the count untouched; the class check below is what
    // catches that case.
    expect(rootGrid.children).toHaveLength(sections[0].fields.length);
    expect(gearGrid.children).toHaveLength(sections[1].fields.length);

    // Class membership rather than a `.custom-sheet__field` selector: an `attr` field roots at
    // `custom-sheet__attr` and carries no `.custom-sheet__field` class at all, so a selector
    // built on that class is blind to the one type it matters most for.
    [...rootGrid.children, ...gearGrid.children].forEach((child) => {
      expect(CELL_ROOTS.some((cls) => child.classList.contains(cls))).toBe(true);
    });
  });
});
