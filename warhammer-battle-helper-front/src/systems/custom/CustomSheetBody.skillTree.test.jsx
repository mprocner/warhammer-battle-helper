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
      rollConfig: { formulaType: 'fixed_d100' },
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
