/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
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
  const tiles = container.querySelectorAll('.custom-sheet__fields > .custom-sheet__cell > .custom-sheet__tile');
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

// Negative progress is a legitimate value (HP below zero, a debt), so neither input carries a
// hardcoded lower bound that would stop the spinner at 0.
test('progress inputs accept negative values', () => {
  const { container } = render(
    <CustomSheetBody sections={sections} values={{ progress: { hp: { current: -3, max: 12 } } }} />
  );
  const inputs = container.querySelectorAll('.custom-sheet__tile--progress .custom-sheet__tile-input');
  expect(inputs).toHaveLength(2);
  inputs.forEach((input) => expect(input).not.toHaveAttribute('min'));
  expect(inputs[0]).toHaveValue(-3);
  expect(fillOf(container).style.width).toBe('0%');
});

const choiceSections = [{
  id: 's', title: '', columns: 2, fields: [
    { key: 'wounded', type: 'checkbox', label: 'Wounded' },
    { key: 'race', type: 'select', label: 'Species', options: ['Human', 'Elf'] },
  ],
}];

const editable = () => ({ attr: jest.fn(), text: jest.fn() });

test('checkbox and select share the tile skeleton with their name in the head', () => {
  const { container } = render(<CustomSheetBody sections={choiceSections} />);
  const check = container.querySelector('.custom-sheet__tile--checkbox');
  const select = container.querySelector('.custom-sheet__tile--select');
  [[check, 'Wounded'], [select, 'Species']].forEach(([tile, name]) => {
    expect(tile.children[0].classList.contains('custom-sheet__tile-head')).toBe(true);
    expect(tile.children[0].textContent).toBe(name);
    expect(tile.children[1].classList.contains('custom-sheet__tile-value')).toBe(true);
  });
});

// The icon is drawn over the real input and shown by `input:checked + icon` in CSS, so it must
// stay the input's immediate next sibling.
test('the checkbox draws its tick as the input\'s next sibling', () => {
  const { container } = render(<CustomSheetBody sections={choiceSections} />);
  const input = container.querySelector('.custom-sheet__check-input');
  expect(input.type).toBe('checkbox');
  expect(input.nextElementSibling.classList.contains('custom-sheet__check-icon')).toBe(true);
});

test('ticking the checkbox stores 1, unticking stores 0', () => {
  const onChange = editable();
  const { container, rerender } = render(<CustomSheetBody sections={choiceSections} onChange={onChange} />);
  fireEvent.click(container.querySelector('.custom-sheet__check-input'));
  expect(onChange.attr).toHaveBeenLastCalledWith('wounded', 1);

  rerender(
    <CustomSheetBody sections={choiceSections} onChange={onChange} values={{ attributes: { wounded: { base: 1 } } }} />
  );
  expect(container.querySelector('.custom-sheet__check-input')).toBeChecked();
  fireEvent.click(container.querySelector('.custom-sheet__check-input'));
  expect(onChange.attr).toHaveBeenLastCalledWith('wounded', 0);
});

test('choosing an option stores its text', () => {
  const onChange = editable();
  const { container } = render(<CustomSheetBody sections={choiceSections} onChange={onChange} />);
  fireEvent.change(container.querySelector('.custom-sheet__select'), { target: { value: 'Elf' } });
  expect(onChange.text).toHaveBeenCalledWith('race', 'Elf');
});

test('a read-only sheet disables both controls', () => {
  const { container } = render(<CustomSheetBody sections={choiceSections} />);
  expect(container.querySelector('.custom-sheet__check-input')).toBeDisabled();
  expect(container.querySelector('.custom-sheet__select')).toBeDisabled();
});

// The name sits in the tile head, apart from the control, so the control carries it itself.
test('checkbox and select are named after their field', () => {
  render(<CustomSheetBody sections={choiceSections} />);
  expect(screen.getByRole('checkbox', { name: 'Wounded' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Species' })).toBeInTheDocument();
});
