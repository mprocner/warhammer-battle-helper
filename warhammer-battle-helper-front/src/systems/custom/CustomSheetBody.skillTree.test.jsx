import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

// Korzeń drzewa to kontener, nie umiejętność: edytor w kreatorze pokazuje wyłącznie
// tree.children, więc GM nigdy nie nazywa korzenia. Backend ma na Children `omitempty`,
// więc świeże drzewo (children: []) wraca z API BEZ pola children — a nie z pustą tablicą.
// Fixture celowo odwzorowuje ten kształt: `[].map()` zwraca `[]`, które jest truthy, więc
// wariant z `children: []` nie odtworzyłby buga (FEATURE-160).
const emptyTreeSections = [{
  id: 'sec1',
  columns: 1,
  fields: [
    { key: 'fld_tree', type: 'skill_tree', label: 'Umiejętności', tree: { key: 'tree_123', label: 'Kategoria' } },
  ],
}];

const filledTreeSections = [{
  id: 'sec1',
  columns: 1,
  fields: [
    {
      key: 'fld_tree',
      type: 'skill_tree',
      label: 'Umiejętności',
      rollable: true,
      rollConfig: { formula: [{ id: 'b1', type: 'dice', value: 'd100' }], successType: 'below_threshold' },
      tree: {
        key: 'tree_123',
        label: 'Kategoria',
        children: [{ key: 'node_a', label: 'Broń biała', rollable: true }],
      },
    },
  ],
}];

describe('CustomSheetBody skill_tree', () => {
  it('renders no skill row for a tree that has no nodes yet', () => {
    const { container } = render(<CustomSheetBody sections={emptyTreeSections} />);

    expect(container.querySelectorAll('.custom-sheet__skill-tree-node-row').length).toBe(0);
  });

  it('never writes a skill value under the bare tree-root key', () => {
    const onChange = { skill: jest.fn() };
    const { container } = render(<CustomSheetBody sections={emptyTreeSections} onChange={onChange} />);

    // Puste drzewo nie ma czego edytować — żaden input wartości nie może się pojawić,
    // bo jedyny kandydat (korzeń) zapisałby klucz "tree_123" bez prefiksu pola.
    expect(container.querySelectorAll('.custom-sheet__skill-val-input').length).toBe(0);
  });

  it('keys a tree node with its field prefix so the backend can resolve the roll', () => {
    const onRoll = jest.fn();
    const { container } = render(<CustomSheetBody sections={filledTreeSections} onRoll={onRoll} />);

    container.querySelector('.custom-sheet__skill-tree-node-row .custom-sheet__roll-btn').click();

    expect(onRoll).toHaveBeenCalledWith({ skillKey: 'fld_tree.node_a', label: 'Broń biała' });
  });
});

describe('CustomSheetBody skill_tree — development marker', () => {
  const devTreeSections = [{
    id: 'sec1',
    columns: 1,
    fields: [{
      key: 'fld_tree',
      type: 'skill_tree',
      label: 'Umiejętności',
      showDevelopment: true,
      tree: { key: 'tree_123', label: 'Kategoria', children: [{ key: 'node_a', label: 'Broń biała' }] },
    }],
  }];

  it('marks a tree node by its dot-path key, not by the bare node key', () => {
    const onToggleDevelopment = jest.fn();
    const { container } = render(
      <CustomSheetBody
        sections={devTreeSections}
        developmentSkills={[]}
        onToggleDevelopment={onToggleDevelopment}
      />
    );

    container.querySelector('.custom-sheet__skill-dev-check').click();

    expect(onToggleDevelopment).toHaveBeenCalledWith('fld_tree.node_a');
  });

  it('renders no checkbox when the field does not ask for one', () => {
    const { container } = render(<CustomSheetBody sections={filledTreeSections} />);
    expect(container.querySelector('.custom-sheet__skill-dev-check')).toBeNull();
  });
});

describe('CustomSheetBody skill_tree — alphabetical sort', () => {
  const sortTree = (over = {}) => ([{
    id: 'sec1',
    columns: 1,
    fields: [{
      key: 'fld_tree',
      type: 'skill_tree',
      label: 'Umiejętności',
      tree: {
        key: 'tree_123',
        label: 'Kategoria',
        children: [
          { key: 'n_walka', label: 'Walka', children: [
            { key: 'n_topor', label: 'Topór' },
            { key: 'n_miecz', label: 'Miecz' },
          ] },
          { key: 'n_alchemia', label: 'Alchemia' },
        ],
      },
      ...over,
    }],
  }]);

  const labels = (container) =>
    [...container.querySelectorAll('.custom-sheet__skill-tree-node-label')].map(el => el.textContent);

  it('keeps the template order by default', () => {
    const { container } = render(<CustomSheetBody sections={sortTree()} />);
    expect(labels(container)).toEqual(['Walka', 'Topór', 'Miecz', 'Alchemia']);
  });

  it('sorts each level on its own, leaving the hierarchy intact', () => {
    const { container } = render(<CustomSheetBody sections={sortTree({ sortAlphabetically: true })} />);
    expect(labels(container)).toEqual(['Alchemia', 'Walka', 'Miecz', 'Topór']);
  });

  it('weaves the player\'s own skills in among the template ones', () => {
    const { container } = render(
      <CustomSheetBody
        sections={sortTree({ sortAlphabetically: true })}
        customSkillNodes={{ 'fld_tree.n_walka.skill_1': { label: 'Rapier' } }}
      />
    );
    expect(labels(container)).toEqual(['Alchemia', 'Walka', 'Miecz', 'Rapier', 'Topór']);
  });
});

describe('CustomSheetBody skill_tree — two columns', () => {
  // Walka weighs 3 nodes, the three others 1 each: a split by branch count (2 + 2) would leave
  // the left column twice as tall, so the weighted cut has to put Walka alone.
  const weightedTree = (over = {}) => ([{
    id: 'sec1',
    columns: 1,
    fields: [{
      key: 'fld_tree',
      type: 'skill_tree',
      label: 'Umiejętności',
      tree: {
        key: 'tree_123',
        label: 'Kategoria',
        children: [
          { key: 'n_walka', label: 'Walka', children: [
            { key: 'n_miecz', label: 'Miecz' }, { key: 'n_topor', label: 'Topór' },
          ] },
          { key: 'n_a', label: 'A' },
          { key: 'n_b', label: 'B' },
          { key: 'n_c', label: 'C' },
        ],
      },
      ...over,
    }],
  }]);

  const colLabels = (col) =>
    [...col.querySelectorAll('.custom-sheet__skill-tree-node-label')].map(e => e.textContent);

  it('renders one column by default', () => {
    const { container } = render(<CustomSheetBody sections={weightedTree()} />);
    expect(container.querySelectorAll('.custom-sheet__skill-col')).toHaveLength(0);
  });

  it('cuts by subtree weight, never through a branch', () => {
    const { container } = render(<CustomSheetBody sections={weightedTree({ twoColumns: true })} />);
    const cols = container.querySelectorAll('.custom-sheet__skill-col');
    expect(cols).toHaveLength(2);
    expect(colLabels(cols[0])).toEqual(['Walka', 'Miecz', 'Topór']);
    expect(colLabels(cols[1])).toEqual(['A', 'B', 'C']);
  });

  it('counts the player\'s own nodes into the weight', () => {
    const { container } = render(
      <CustomSheetBody
        sections={weightedTree({ twoColumns: true })}
        customSkillNodes={{
          'fld_tree.n_a.skill_1': { label: 'A1' },
          'fld_tree.n_a.skill_2': { label: 'A2' },
        }}
      />
    );
    const cols = container.querySelectorAll('.custom-sheet__skill-col');
    // Walka 3 + A 3 = 6 on the left against B 1 + C 1 = 2 would be worse than 3 against 5,
    // so the cut lands right after Walka.
    expect(colLabels(cols[0])).toEqual(['Walka', 'Miecz', 'Topór']);
    expect(colLabels(cols[1])).toEqual(['A', 'A1', 'A2', 'B', 'C']);
  });

  // The combination that shipped broken: a two-column tree whose add button was a direct
  // child of the container the --two-col modifier turns into a flex row, so it rendered as a
  // third column beside the two branch columns instead of underneath both.
  it('places the add button under both columns, not inside either of them', () => {
    const { container } = render(
      <CustomSheetBody
        sections={weightedTree({ twoColumns: true, playerCanAddSkills: true })}
        onAddCustomSkill={() => {}}
      />
    );
    const addBtn = container.querySelector('.custom-sheet__skill-tree-add-btn');
    expect(addBtn).not.toBeNull();
    expect(addBtn.closest('.custom-sheet__skill-col')).toBeNull();
    expect(addBtn.closest('.custom-sheet__skill-tree')).toBeNull();
  });
});
