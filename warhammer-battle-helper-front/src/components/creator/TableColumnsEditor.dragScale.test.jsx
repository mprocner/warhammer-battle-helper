import React from 'react';
import { render, screen } from '@testing-library/react';
import '../../i18n';
import TableColumnsEditor from './TableColumnsEditor';

// While a card is dragged over a neighbour of a different height, dnd-kit's sortable strategy
// reports a transform with scaleY ≠ 1 to morph the dragged card into the slot's size. Column cards
// differ in height (a select column carries its options editor), so applying that scale squashed
// or stretched the card mid-drag. Only the translation may reach the DOM. jsdom cannot run a real
// drag, so useSortable is stubbed to report exactly that mid-drag transform.
jest.mock('@dnd-kit/sortable', () => {
  const actual = jest.requireActual('@dnd-kit/sortable');
  return {
    ...actual,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      setActivatorNodeRef: () => {},
      transform: { x: 0, y: 24, scaleX: 1, scaleY: 0.4 },
      transition: undefined,
      isDragging: true,
    }),
  };
});

test('a dragged column card moves but never changes size', () => {
  const cols = [{ key: 'a', label: 'Nazwa', type: 'text', options: [], optionsFromSkills: false }];
  render(<TableColumnsEditor columns={cols} onChange={() => {}} columnTypes={['text', 'select']} />);
  // eslint-disable-next-line testing-library/no-node-access
  const card = screen.getByLabelText('Move column – Nazwa').closest('.creator__table-col');
  expect(card.style.transform).toContain('translate3d(0px, 24px, 0)');
  expect(card.style.transform).not.toContain('scale');
});
