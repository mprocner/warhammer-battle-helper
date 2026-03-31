import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';

const DroppableBackButton = ({ parentFolderId, onNavigateUp }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'parent-folder',
    data: { type: 'parent', folderId: parentFolderId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`files-tab__item files-tab__item--back ${isOver ? 'files-tab__item--drop-target' : ''}`}
      onClick={onNavigateUp}
    >
      <span className="files-tab__item-icon"><ArrowUpwardIcon fontSize="inherit" /></span>
      <span className="files-tab__item-name">..</span>
    </div>
  );
};

export default DroppableBackButton;
