import React from 'react';
import { render, screen } from '@testing-library/react';
import useSortableItem from './useSortableItem';
import DragGrip from './DragGrip';

// While an item is dragged over a neighbour of a different height, dnd-kit's sortable strategy
// reports a transform with scaleY ≠ 1 to morph the dragged item into the slot's size. Items in the
// creator's lists differ in height, so applying that scale squashed or stretched them mid-drag.
// Only the translation may reach the DOM. jsdom cannot run a real drag, so useSortable is stubbed
// to report exactly that mid-drag transform.
jest.mock('@dnd-kit/sortable', () => {
  const actual = jest.requireActual('@dnd-kit/sortable');
  return {
    ...actual,
    useSortable: () => ({
      attributes: { 'aria-roledescription': 'sortable' },
      listeners: {},
      setNodeRef: () => {},
      setActivatorNodeRef: () => {},
      transform: { x: 0, y: 24, scaleX: 1, scaleY: 0.4 },
      transition: undefined,
      isDragging: true,
    }),
  };
});

function Item() {
  const { rootProps, gripProps, isDragging } = useSortableItem('a');
  return (
    <div {...rootProps} data-testid="item" data-dragging={isDragging}>
      <DragGrip label="Move" {...gripProps} />
    </div>
  );
}

test('a dragged item moves but never changes size', () => {
  render(<Item />);
  const item = screen.getByTestId('item');
  expect(item.style.transform).toContain('translate3d(0px, 24px, 0)');
  expect(item.style.transform).not.toContain('scale');
  expect(item).toHaveAttribute('data-dragging', 'true');
});

test('the grip is a labelled non-submit button', () => {
  render(<Item />);
  const grip = screen.getByLabelText('Move');
  expect(grip.tagName).toBe('BUTTON');
  expect(grip).toHaveAttribute('type', 'button');
  expect(grip).toHaveAttribute('aria-roledescription', 'sortable');
  expect(grip).toHaveClass('creator__drag-grip');
});
