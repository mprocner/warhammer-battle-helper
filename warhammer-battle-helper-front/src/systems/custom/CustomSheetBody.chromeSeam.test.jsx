import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

const sections = [
  { id: 'sec_root', title: 'Cechy', columns: 2, fields: [
    { key: 'attr_ws', type: 'attr', label: 'WW' },
    { key: 'sec_in', type: 'section', label: '', section: {
      id: 'sec_in', title: 'Wewnątrz', columns: 1, fields: [
        { key: 'num_gold', type: 'number', label: 'Złoto' },
      ],
    } },
  ] },
];

describe('CustomSheetBody renderChrome seam', () => {
  test('without the prop it adds nothing — no wrapper element appears', () => {
    const { container } = render(<CustomSheetBody sections={sections} />);
    expect(container.querySelector('.custom-sheet__editable')).toBeNull();
  });

  test('with the prop every node gets one wrapper and one chrome call', () => {
    const seen = [];
    const { container } = render(
      <CustomSheetBody
        sections={sections}
        renderChrome={(node, path) => {
          seen.push({ id: node.key ?? node.id, path: path.join('.') });
          return <b data-testid="chrome" data-path={path.join('.')} />;
        }}
      />
    );
    // Root section, its two children, and the nested section's single child.
    expect(seen).toEqual([
      { id: 'sec_root', path: '0' },
      { id: 'attr_ws',  path: '0.0' },
      { id: 'sec_in',   path: '0.1' },
      { id: 'num_gold', path: '0.1.0' },
    ]);
    expect(container.querySelectorAll('.custom-sheet__editable')).toHaveLength(4);
    expect(container.querySelectorAll('[data-testid="chrome"]')).toHaveLength(4);
  });

  test('a nested section is wrapped once, not twice', () => {
    const { container } = render(
      <CustomSheetBody sections={sections} renderChrome={() => <b />} />
    );
    const nested = container.querySelector('.custom-sheet__section--nested');
    // Its own wrapper is the parent; a second wrapper would sit between them.
    expect(nested.parentElement).toHaveClass('custom-sheet__editable');
    expect(nested.querySelector(':scope > .custom-sheet__editable')).toBeNull();
  });

  test('chrome returning null leaves a wrapper but no extra content', () => {
    const { container } = render(
      <CustomSheetBody sections={sections} renderChrome={() => null} />
    );
    expect(container.querySelectorAll('.custom-sheet__editable')).toHaveLength(4);
  });
});

// FEATURE-214: a rollable field must show a die in three distinct ways, one per caller. `attr_ws`
// below is `rollable: true` so each case has something to assert on.
const rollableSections = [
  { id: 'sec_root', title: 'Cechy', columns: 1, fields: [
    { key: 'attr_ws', type: 'attr', label: 'WW', rollable: true },
  ] },
];

describe('CustomSheetBody roll affordance — three callers', () => {
  test('creator edit view (renderChrome + showRollMarkers, no onRoll): static marker, no interactive button', () => {
    const { container } = render(
      <CustomSheetBody sections={rollableSections} renderChrome={() => <b />} showRollMarkers />
    );
    expect(container.querySelector('.custom-sheet__roll-btn--static')).not.toBeNull();
    expect(container.querySelector('button.custom-sheet__roll-btn')).toBeNull();
  });

  // Regression for the bug this brief fixes: the die was gated on renderChrome, so the clean
  // preview (renderChrome=null) hid it — but a player DOES see a die on a rollable field, so the
  // preview's whole point (show what a player sees, minus editing furniture) was being violated.
  test('clean preview (showRollMarkers, no renderChrome, no onRoll): still renders the static marker', () => {
    const { container } = render(
      <CustomSheetBody sections={rollableSections} renderChrome={null} showRollMarkers />
    );
    expect(container.querySelector('.custom-sheet__roll-btn--static')).not.toBeNull();
    expect(container.querySelector('button.custom-sheet__roll-btn')).toBeNull();
  });

  test('no props at all (component default): no die', () => {
    const { container } = render(<CustomSheetBody sections={rollableSections} />);
    expect(container.querySelector('.custom-sheet__roll-btn')).toBeNull();
  });

  test("player's sheet (onRoll, no renderChrome): interactive button, no static marker", () => {
    const { container } = render(
      <CustomSheetBody
        sections={rollableSections}
        values={{ attributes: { attr_ws: { base: 35 } } }}
        onChange={{ attr: () => {} }}
        onRoll={() => {}}
      />
    );
    expect(container.querySelector('button.custom-sheet__roll-btn')).not.toBeNull();
    expect(container.querySelector('.custom-sheet__roll-btn--static')).toBeNull();
  });
});
