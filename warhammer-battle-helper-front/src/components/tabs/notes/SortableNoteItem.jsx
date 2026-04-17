import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import NoteItem from './NoteItem';

const SortableNoteItem = ({ note, isOwner, onEdit, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <NoteItem
        note={note}
        isOwner={isOwner}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandleProps={{ ...listeners, ...attributes }}
        isDragging={isDragging}
        isFilterActive={false}
      />
    </div>
  );
};

export default SortableNoteItem;
