import React from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { reorderById, lockToVerticalAxis } from '../../../utils/sortableList';

// A vertical drag-to-reorder list. Children are the items, each wired with useSortableItem under
// the id idOf gives it. onReorder receives the whole reordered array — never indices — and only
// when something actually moved, so a drop in place never costs a template save.
export default function SortableList({ items, idOf = item => item.id, onReorder, children }) {
  // distance: a press on the grip that never moves 5px stays a click. The keyboard sensor lets
  // the grip be picked up with Space and moved with the arrow keys.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = ({ active, over }) => {
    const next = reorderById(items, active.id, over?.id, idOf);
    if (next !== items) onReorder(next);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[lockToVerticalAxis]} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(idOf)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}
