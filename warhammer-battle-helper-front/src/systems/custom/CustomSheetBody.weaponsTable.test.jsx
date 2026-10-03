import React, { useState } from 'react';
import { render, fireEvent } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

// Test the creator's affordance policy for weapons_table. This is the width-parity guarantee:
// the creator must reserve the same column widths as the game, so a layout the GM judges to be
// correct remains correct when players load the sheet. For weapons, the affordance is the
// favourites star. Without live handlers it must render statically so the header reserves its
// column; without `showAffordances` the column would silently disappear and every other column
// would shift one star-width away from its label. This test guards against reverting
// showStar to `!!onToggleFavorite` alone.
// Module-scoped (not inside the describe below) so the GM-row fixture is also reachable from the
// "read first, edit on the pencil" describe further down — a GM weapon there needs the exact same
// always-on preset shape.
const weaponsSections = () => ([{
  id: 'sec1',
  columns: 1,
  fields: [
    {
      key: 'wpn_table',
      type: 'weapons_table',
      label: 'Bronie',
      columns: [{ key: 'name', label: 'Nazwa', type: 'text' }],
      presetWeapons: [
        {
          id: 'preset_sword',
          cells: { name: 'Miecz' },
          damage: {},
          alwaysOn: true,
        },
      ],
    },
  ],
}]);

describe('CustomSheetBody weapons_table — creator affordance policy', () => {
  it('renders the star statically in the creator when showAffordances is true and onToggleFavorite is absent', () => {
    const { container } = render(<CustomSheetBody sections={weaponsSections()} showAffordances />);
    // Static star should be present for layout parity
    expect(container.querySelector('.custom-sheet__star-btn--static')).not.toBeNull();
    // Interactive button should NOT be present
    expect(container.querySelector('button.custom-sheet__star-btn')).toBeNull();
  });
});

const playerWeaponSections = () => ([{
  id: 'sec1',
  columns: 1,
  fields: [
    {
      key: 'wpn_table',
      type: 'weapons_table',
      label: 'Bronie',
      columns: [{ key: 'name', label: 'Nazwa', type: 'text' }],
    },
  ],
}]);

const playerValues = { weapons: { wpn_table: [{ id: 'w1', cells: { name: 'Miecz' }, damage: {} }] } };

const noop = () => {};
const sheetHandlers = {
  skill: noop, skillAdvances: noop, text: noop, progress: noop, number: noop,
  weaponAdd: noop, weaponAddFromPreset: noop, weaponRemove: noop,
  weaponCell: noop, weaponDamage: noop, weaponFavorite: noop,
};

describe('CustomSheetBody weapons_table — read first, edit on the pencil', () => {
  const renderRow = () => render(
    <CustomSheetBody sections={playerWeaponSections()} values={playerValues} onChange={sheetHandlers} />
  );

  it('shows the weapon as text, not as inputs, until asked', () => {
    const { container } = renderRow();
    expect(container.querySelector('.custom-sheet__weapon-cell-input')).toBeNull();
    expect(container.querySelector('.custom-sheet__weapon-cell-static').textContent).toBe('Miecz');
  });

  // The whole point: the destructive control is the one a stray click must not reach.
  it('keeps the delete button out of reach while the row is at rest', () => {
    const { container } = renderRow();
    expect(container.querySelector('.custom-sheet__weapon-remove')).toBeNull();
  });

  it('turns the cells into inputs when the pencil is clicked', () => {
    const { container } = renderRow();
    fireEvent.click(container.querySelector('.custom-sheet__weapon-edit'));
    expect(container.querySelector('.custom-sheet__weapon-cell-input').value).toBe('Miecz');
    expect(container.querySelector('.custom-sheet__weapon-remove')).not.toBeNull();
  });

  it('goes back to text when the edit is closed', () => {
    const { container } = renderRow();
    fireEvent.click(container.querySelector('.custom-sheet__weapon-edit'));
    fireEvent.click(container.querySelector('.custom-sheet__weapon-save'));
    expect(container.querySelector('.custom-sheet__weapon-cell-input')).toBeNull();
  });

  // A GM weapon is not the player's to change, so it has no way in at all.
  it('gives a GM weapon no pencil', () => {
    const { container } = render(<CustomSheetBody sections={weaponsSections()} onChange={sheetHandlers} />);
    expect(container.querySelector('.custom-sheet__weapon-edit')).toBeNull();
  });
});

// Extra requirement A (task-8 review carryover): the previous task's only weapons_table fixture
// in the snapshot suite (CustomSheetBody.domShape.test.jsx) never sets field.rollable, so the die
// branch in weaponGridTemplate/WeaponsTableRow was never exercised end-to-end — a control could
// sit in the wrong grid cell and still pass every existing test. This fixture sets rollable: true
// and checks the die's DOM position relative to the actions cell, not just that a die exists.
const rollablePlayerWeaponSections = () => ([{
  id: 'sec1',
  columns: 1,
  fields: [
    {
      key: 'wpn_table',
      type: 'weapons_table',
      label: 'Bronie',
      rollable: true,
      columns: [{ key: 'name', label: 'Nazwa', type: 'text' }],
    },
  ],
}]);

describe('CustomSheetBody weapons_table — die sits in its own cell, not in the actions cell', () => {
  const dieAndActionsIndices = (row) => {
    const children = Array.from(row.children);
    return {
      dieIndex: children.findIndex(el => el.classList.contains('custom-sheet__roll-btn')),
      actionsIndex: children.findIndex(el => el.classList.contains('custom-sheet__weapon-actions')),
      children,
    };
  };

  it('places the die immediately before the actions cell at rest', () => {
    const { container } = render(
      <CustomSheetBody sections={rollablePlayerWeaponSections()} values={playerValues} onChange={sheetHandlers} onRoll={noop} />
    );
    const row = container.querySelector('.custom-sheet__weapon-row');
    const { dieIndex, actionsIndex, children } = dieAndActionsIndices(row);
    expect(dieIndex).toBeGreaterThan(-1);
    expect(actionsIndex).toBe(dieIndex + 1);
    expect(children[actionsIndex].contains(children[dieIndex])).toBe(false);
  });

  it('keeps the die out of the actions cell while editing', () => {
    const { container } = render(
      <CustomSheetBody sections={rollablePlayerWeaponSections()} values={playerValues} onChange={sheetHandlers} onRoll={noop} />
    );
    fireEvent.click(container.querySelector('.custom-sheet__weapon-edit'));
    const row = container.querySelector('.custom-sheet__weapon-row');
    const { dieIndex, actionsIndex, children } = dieAndActionsIndices(row);
    expect(dieIndex).toBeGreaterThan(-1);
    expect(actionsIndex).toBe(dieIndex + 1);
    // Edit mode adds a button to the actions cell, not to the die's — two buttons (save, remove).
    expect(children[actionsIndex].querySelectorAll('button').length).toBe(2);
    expect(children[actionsIndex].contains(children[dieIndex])).toBe(false);
  });
});

// GAP 1: The damage formula is read-only at rest because of the ternary in WeaponsTableRow:
// `rendering ? readOnly : true`. This test pins the guarantee that player-fillable damage
// blocks cannot be typed into while the row is at rest.
const damageFormulaWithPlayerInput = () => ([{
  id: 'sec1',
  columns: 1,
  fields: [
    {
      key: 'wpn_table',
      type: 'weapons_table',
      label: 'Bronie',
      columns: [{ key: 'name', label: 'Nazwa', type: 'text' }],
      damageFormula: [
        { id: 'dmg_1', type: 'const_input' }, // Player-fillable flat damage number
      ],
    },
  ],
}]);

describe('CustomSheetBody weapons_table — damage formula read-only at rest (FEATURE-224 GAP 1)', () => {
  const renderWithDamage = () => render(
    <CustomSheetBody
      sections={damageFormulaWithPlayerInput()}
      values={{ weapons: { wpn_table: [{ id: 'w1', cells: { name: 'Miecz' }, damage: { dmg_1: '5' } }] } }}
      onChange={sheetHandlers}
    />
  );

  it('renders the damage input as read-only at rest', () => {
    const { container } = renderWithDamage();
    const damageInput = container.querySelector('.custom-sheet__weapon-dmg-input');
    expect(damageInput).not.toBeNull();
    expect(damageInput.readOnly).toBe(true);
  });

  it('makes the damage input editable after clicking the pencil', () => {
    const { container } = renderWithDamage();
    fireEvent.click(container.querySelector('.custom-sheet__weapon-edit'));
    const damageInput = container.querySelector('.custom-sheet__weapon-dmg-input');
    expect(damageInput).not.toBeNull();
    expect(damageInput.readOnly).toBe(false);
  });
});

// GAP 2: One thing is editable at a time across the sheet because all three fields
// (skill_table, skill_tree, weapons_table) share a single editingPath state. This test pins the
// guarantee that entering edit on a weapon closes an open skill rename and vice versa.
const skillAndWeaponSections = () => ([{
  id: 'sec1',
  columns: 1,
  fields: [
    {
      key: 'fld_skills',
      type: 'skill_table',
      label: 'Umiejętności',
      playerCanAddSkills: true,
      skills: [],
    },
    {
      key: 'wpn_table',
      type: 'weapons_table',
      label: 'Bronie',
      columns: [{ key: 'name', label: 'Nazwa', type: 'text' }],
    },
  ],
}]);

describe('CustomSheetBody — one edit at a time across skill_table and weapons_table (FEATURE-224 GAP 2)', () => {
  it('closes a skill rename when clicking a weapon edit pencil', () => {
    // The fixture already has one weapon in the field.
    const weaponValues = { weapons: { wpn_table: [{ id: 'w1', cells: { name: 'Miecz' }, damage: {} }] } };
    const { container } = render(
      <CustomSheetBody
        sections={skillAndWeaponSections()}
        values={weaponValues}
        customSkillNodes={{ 'fld_skills.skill_1': { label: 'Umiejętność' } }}
        onAddCustomSkill={() => {}}
        onUpdateCustomSkill={() => {}}
        onRemoveCustomSkill={() => {}}
        onChange={sheetHandlers}
      />
    );

    // Enter rename mode on the skill
    fireEvent.click(container.querySelector('.custom-sheet__skill-edit'));
    expect(container.querySelector('.custom-sheet__skill-name-input')).not.toBeNull();

    // Click the weapon's pencil
    fireEvent.click(container.querySelector('.custom-sheet__weapon-edit'));

    // Skill's rename input should be gone now
    expect(container.querySelector('.custom-sheet__skill-name-input')).toBeNull();
    // Weapon's edit inputs should be present
    expect(container.querySelector('.custom-sheet__weapon-cell-input')).not.toBeNull();
  });
});

// A freshly added row has no values yet, so at rest it would read as a line of em-dashes — the
// one moment the "read first, edit on the pencil" design (above) gets in the player's way instead
// of protecting them. CharacterSheet's addWeaponRow mints the row's id and now hands it back
// through onChange.weaponAdd's return value so the table can open straight into edit. A harness
// is needed (not the static `sheetHandlers` used elsewhere in this file) because the real
// behaviour only shows up across a state update: onChange.weaponAdd must both add the row to
// `values.weapons` and return its id, the same two things CharacterSheet's handler does.
describe('CustomSheetBody weapons_table — a newly added row opens in edit mode', () => {
  function Harness() {
    const [weapons, setWeapons] = useState({ wpn_table: [] });
    const handlers = {
      ...sheetHandlers,
      weaponAdd: (fieldKey) => {
        const id = 'w_new';
        setWeapons(prev => ({ ...prev, [fieldKey]: [...(prev[fieldKey] || []), { id, cells: {}, damage: {} }] }));
        return id;
      },
    };
    return <CustomSheetBody sections={playerWeaponSections()} values={{ weapons }} onChange={handlers} />;
  }

  it('renders the new row as inputs, not static text, right after "+ Add weapon" is clicked', () => {
    const { container } = render(<Harness />);
    fireEvent.click(container.querySelector('.custom-sheet__weapon-add-btn'));
    expect(container.querySelector('.custom-sheet__weapon-cell-input')).not.toBeNull();
    expect(container.querySelector('.custom-sheet__weapon-cell-static')).toBeNull();
  });
});
