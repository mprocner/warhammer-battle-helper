import React from 'react';
import { render } from '@testing-library/react';
import SortableList from './SortableList';

// jsdom cannot run a real drag, so DndContext is replaced by a stub that hands its onDragEnd to
// the test, which then plays the event dnd-kit would fire on drop.
let mockDragEnd;
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({ onDragEnd, children }) => { mockDragEnd = onDragEnd; return children; },
  };
});

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

const setup = (props = {}) => {
  const onReorder = jest.fn();
  render(<SortableList items={items} onReorder={onReorder} {...props}><div /></SortableList>);
  return onReorder;
};

test('a drop on another item reports the reordered list', () => {
  const onReorder = setup();
  mockDragEnd({ active: { id: 'a' }, over: { id: 'c' } });
  expect(onReorder).toHaveBeenCalledWith([{ id: 'b' }, { id: 'c' }, { id: 'a' }]);
});

// No move means no template save — the caller must not be woken up.
test('a drop outside the list or on itself reports nothing', () => {
  const onReorder = setup();
  mockDragEnd({ active: { id: 'a' }, over: null });
  mockDragEnd({ active: { id: 'b' }, over: { id: 'b' } });
  expect(onReorder).not.toHaveBeenCalled();
});

test('items are matched by the id idOf names', () => {
  const cols = [{ key: 'x' }, { key: 'y' }];
  const onReorder = jest.fn();
  render(<SortableList items={cols} idOf={c => c.key} onReorder={onReorder}><div /></SortableList>);
  mockDragEnd({ active: { id: 'y' }, over: { id: 'x' } });
  expect(onReorder).toHaveBeenCalledWith([{ key: 'y' }, { key: 'x' }]);
});
