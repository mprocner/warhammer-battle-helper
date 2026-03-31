import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';

const DroppableMusicBackButton = ({ parentFolderId, onNavigateUp }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'music-parent-folder',
    data: { type: 'parent', folderId: parentFolderId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`music-tab__track-item music-tab__folder-item music-tab__back-item ${isOver ? 'music-tab__folder-item--drop-target' : ''}`}
      onClick={onNavigateUp}
    >
      <span className="music-tab__track-icon"><ArrowUpwardIcon fontSize="inherit" /></span>
      <span className="music-tab__track-name">..</span>
    </div>
  );
};

export default DroppableMusicBackButton;
