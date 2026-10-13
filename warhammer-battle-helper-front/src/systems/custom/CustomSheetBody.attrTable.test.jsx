/* eslint-disable testing-library/no-node-access, testing-library/no-container -- table cells are asserted by BEM class */
import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

const tableSections = (over = {}) => ([{
  id: 'sec1', columns: 1,
  fields: [{
    key: 'fld_t', type: 'attr_table', label: 'Cechy', advancesLabel: 'Rozw.',
    attrRows: [
      { id: 'attr_ws', label: 'Walka wręcz', abbr: 'WW', min: 0, max: 100 },
      { id: 'attr_s', label: 'Siła' },
    ],
    ...over,
  }],
}]);

const values = { attributes: { attr_ws: { base: 31, advances: 5, current: 36 }, attr_s: { base: 20, advances: 0, current: 20 } } };

test('headers show the abbr, falling back to the label', () => {
  const { container } = render(<CustomSheetBody sections={tableSections()} values={values} />);
  const heads = [...container.querySelectorAll('.custom-sheet__attr-table-head')].map(el => el.textContent);
  expect(heads).toEqual(['WW', 'Siła']);
});

test('without advances: one editable value row, no total', () => {
  const onChange = { attr: jest.fn(), advances: jest.fn() };
  const { container } = render(<CustomSheetBody sections={tableSections()} values={values} onChange={onChange} />);
  const inputs = container.querySelectorAll('.custom-sheet__attr-table-input');
  expect(inputs).toHaveLength(2);
  expect(container.querySelector('.custom-sheet__attr-table-total')).toBeNull();
  fireEvent.change(inputs[0], { target: { value: '40' } });
  expect(onChange.attr).toHaveBeenCalledWith('attr_ws', '40');
  expect(inputs[0]).toHaveAttribute('max', '100');
});

test('with advances: base and advances inputs per attribute plus a read-only total', () => {
  const onChange = { attr: jest.fn(), advances: jest.fn() };
  const { container } = render(
    <CustomSheetBody sections={tableSections({ hasAdvances: true })} values={values} onChange={onChange} />
  );
  expect(container.querySelectorAll('.custom-sheet__attr-table-input')).toHaveLength(4);
  const totals = [...container.querySelectorAll('.custom-sheet__attr-table-total')].map(el => el.textContent);
  expect(totals).toEqual(['36', '20']);
  expect(screen.getByText('Rozw.')).toBeTruthy();
  expect(screen.getByLabelText('Walka wręcz – Base')).toBeTruthy();
  expect(screen.getByLabelText('Walka wręcz – Rozw.')).toBeTruthy();
  fireEvent.change(container.querySelectorAll('.custom-sheet__attr-table-input--adv')[0], { target: { value: '7' } });
  expect(onChange.advances).toHaveBeenCalledWith('attr_ws', '7');
});

test('a rollable table rolls the clicked row by its id', () => {
  const onRoll = jest.fn();
  const { container } = render(
    <CustomSheetBody sections={tableSections({ rollable: true })} values={values} onRoll={onRoll} />
  );
  const dice = container.querySelectorAll('.custom-sheet__attr-table .custom-sheet__roll-btn');
  expect(dice).toHaveLength(2);
  fireEvent.click(dice[1]);
  expect(onRoll).toHaveBeenCalledWith({ skillKey: 'attr_s', label: 'Siła' });
});

test('the creator shows static dice without handlers', () => {
  const { container } = render(
    <CustomSheetBody sections={tableSections({ rollable: true })} values={values} showAffordances />
  );
  expect(container.querySelectorAll('.custom-sheet__attr-table .custom-sheet__roll-btn--static')).toHaveLength(2);
});

test('no rows renders the empty hint instead of an empty grid', () => {
  const { container } = render(<CustomSheetBody sections={tableSections({ attrRows: [] })} values={values} />);
  expect(container.querySelector('.custom-sheet__attr-table-band')).toBeNull();
  expect(container.querySelector('.custom-sheet__attr-table-empty')).not.toBeNull();
});

describe('band splitting from the measured width', () => {
  const realRO = window.ResizeObserver;
  let callbacks;
  beforeEach(() => {
    callbacks = [];
    window.ResizeObserver = class {
      constructor(cb) { callbacks.push(cb); }
      observe() {}
      disconnect() {}
    };
  });
  afterEach(() => { window.ResizeObserver = realRO; });

  const fiveRows = Array.from({ length: 5 }, (_, i) => ({ id: `attr_${i}`, label: `A${i}` }));
  const fire = (width) => act(() => { callbacks.forEach(cb => cb([{ contentRect: { width } }])); });

  test('a measured width splits the table into bands, each with its own row label', () => {
    const { container } = render(<CustomSheetBody sections={tableSections({ attrRows: fiveRows })} values={values} />);
    fire(64 + 2 * 48);
    const bands = container.querySelectorAll('.custom-sheet__attr-table-band');
    expect(bands).toHaveLength(3);
    bands.forEach(b => expect(b.querySelectorAll('.custom-sheet__attr-table-rowlabel').length).toBeGreaterThan(0));
  });

  test('a table that starts empty still measures once rows are added', () => {
    const { container, rerender } = render(<CustomSheetBody sections={tableSections({ attrRows: [] })} values={values} />);
    rerender(<CustomSheetBody sections={tableSections({ attrRows: fiveRows })} values={values} />);
    fire(64 + 2 * 48);
    expect(container.querySelectorAll('.custom-sheet__attr-table-band')).toHaveLength(3);
  });
});
