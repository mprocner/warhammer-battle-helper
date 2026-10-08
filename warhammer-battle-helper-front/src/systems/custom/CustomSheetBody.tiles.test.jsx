/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

const sections = [{
  id: 's', title: '', columns: 4, fields: [
    { key: 'hp', type: 'progress', label: 'Wounds' },
    { key: 'gold', type: 'number', label: 'Gold' },
    { key: 'bonus', type: 'computed', label: 'Bonus', formula: [{ type: 'const', num: 3 }], default: null },
    { key: 'race', type: 'text_short', label: 'Species' },
  ],
}];

const fillOf = (container) => container.querySelector('.custom-sheet__tile-fill');

test('number, progress, computed and text share the tile skeleton', () => {
  const { container } = render(<CustomSheetBody sections={sections} />);
  const tiles = container.querySelectorAll('.custom-sheet__fields > .custom-sheet__tile');
  expect(tiles).toHaveLength(4);
  tiles.forEach((tile) => {
    expect(tile.children[0].classList.contains('custom-sheet__tile-head')).toBe(true);
    expect(tile.children[1].classList.contains('custom-sheet__tile-value')).toBe(true);
  });
});

test('the progress strip is as wide as current / max', () => {
  const { container } = render(
    <CustomSheetBody sections={sections} values={{ progress: { hp: { current: 9, max: 12 } } }} />
  );
  expect(fillOf(container).style.width).toBe('75%');
  expect(fillOf(container).classList.contains('custom-sheet__tile-fill--low')).toBe(false);
});

test('the strip turns low at a quarter of the maximum', () => {
  const { container } = render(
    <CustomSheetBody sections={sections} values={{ progress: { hp: { current: 3, max: 12 } } }} />
  );
  expect(fillOf(container).classList.contains('custom-sheet__tile-fill--low')).toBe(true);
});

test('the strip clamps at full width when current exceeds the maximum', () => {
  const { container } = render(
    <CustomSheetBody sections={sections} values={{ progress: { hp: { current: 20, max: 12 } } }} />
  );
  expect(fillOf(container).style.width).toBe('100%');
});

test('a progress without a maximum draws an empty strip, not a low one', () => {
  const { container } = render(<CustomSheetBody sections={sections} />);
  expect(fillOf(container).style.width).toBe('0%');
  expect(fillOf(container).classList.contains('custom-sheet__tile-fill--low')).toBe(false);
});
