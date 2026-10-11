/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render } from '@testing-library/react';
import '../../i18n';
import CustomSheetBody from './CustomSheetBody';

// PLAYRPG-241: the grid child of a section is always one cell element carrying the field's row
// span, in the game and in the creator alike. If the creator wrapped the cell in a second
// element, the span would sit on the wrong grid child and the creator would lie about the layout.
const sections = [{
  id: 's', title: '', columns: 2, fields: [
    { key: 'name', type: 'char_name', label: 'Name' },
    { key: 'portrait', type: 'char_avatar', label: 'Portrait' },
    { key: 'career', type: 'text_short', label: 'Career' },
    { key: 'ws', type: 'attr', label: 'WS' },
    { key: 'bs', type: 'attr', label: 'BS', hasAdvances: true },
    { key: 'pic', type: 'image', label: 'Picture' },
  ],
}];

const gridOf = (container) => container.querySelector('.custom-sheet__fields--2-col');

test('in the game every field sits in one cell carrying its row span', () => {
  const { container } = render(<CustomSheetBody sections={sections} />);
  expect([...gridOf(container).children].map((cell) => cell.className)).toEqual([
    'custom-sheet__cell custom-sheet__cell--rows-1',
    'custom-sheet__cell custom-sheet__cell--rows-2',
    'custom-sheet__cell custom-sheet__cell--rows-1',
    'custom-sheet__cell custom-sheet__cell--rows-1',
    'custom-sheet__cell custom-sheet__cell--rows-2',
    'custom-sheet__cell',
  ]);
});

test('in the creator the chrome wrapper is the cell, not a wrapper around it', () => {
  const { container } = render(<CustomSheetBody sections={sections} renderChrome={() => null} />);
  const cells = [...gridOf(container).children];
  expect(cells).toHaveLength(sections[0].fields.length);
  cells.forEach((cell) => {
    expect(cell).toHaveClass('custom-sheet__cell');
    expect(cell).toHaveClass('custom-sheet__editable');
  });
  expect(cells[1]).toHaveClass('custom-sheet__cell--rows-2');
  expect(container.querySelector('.custom-sheet__cell .custom-sheet__cell')).toBeNull();
});

test('root sections are not grid cells', () => {
  const game = render(<CustomSheetBody sections={sections} />);
  expect(game.container.querySelector('.custom-sheet__sections > .custom-sheet__cell')).toBeNull();
  game.unmount();

  const creator = render(<CustomSheetBody sections={sections} renderChrome={() => null} />);
  const rootWrapper = creator.container.querySelector('.custom-sheet__sections > .custom-sheet__editable');
  expect(rootWrapper).not.toHaveClass('custom-sheet__cell');
});

const nestedSections = [{
  id: 'p', title: '', columns: 2, fields: [
    { key: 'a', type: 'text_short', label: 'A' },
    { key: 'n1', type: 'section', section: { id: 'n1', title: 'N1', columns: 1, fields: [{ key: 'x', type: 'text_short', label: 'X' }] } },
    { key: 'n2', type: 'section', section: { id: 'n2', title: 'N2', columns: 1, fields: [{ key: 'y', type: 'text_short', label: 'Y' }] } },
  ],
}];

test('a nested section cell is marked so it can stretch to its row (FEATURE-213)', () => {
  const game = render(<CustomSheetBody sections={nestedSections} />);
  expect([...gridOf(game.container).children].map((c) => c.className)).toEqual([
    'custom-sheet__cell custom-sheet__cell--rows-1',
    'custom-sheet__cell custom-sheet__cell--section',
    'custom-sheet__cell custom-sheet__cell--section',
  ]);
  game.unmount();

  const creator = render(<CustomSheetBody sections={nestedSections} renderChrome={() => null} />);
  const cells = [...gridOf(creator.container).children];
  expect(cells[1]).toHaveClass('custom-sheet__cell--section');
  expect(cells[2]).toHaveClass('custom-sheet__cell--section');
  expect(cells[0]).not.toHaveClass('custom-sheet__cell--section');
});

test('a field that renders nothing leaves no empty cell behind', () => {
  const withUnknown = [{
    id: 'u', title: '', columns: 2, fields: [
      { key: 'x', type: 'no_such_type', label: 'X' },
      { key: 'y', type: 'text_short', label: 'Y' },
    ],
  }];
  const { container } = render(<CustomSheetBody sections={withUnknown} />);
  expect(gridOf(container).children).toHaveLength(1);
});
