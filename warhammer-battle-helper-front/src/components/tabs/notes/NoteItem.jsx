import React from 'react';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

const NoteItem = ({ note, isOwner, onEdit, onDelete, dragHandleProps, isDragging, isFilterActive }) => {
  return (
    <div className={[
      'note-item',
      note.isPrivate ? 'note-item--private' : 'note-item--public',
      isDragging ? 'note-item--dragging' : '',
    ].filter(Boolean).join(' ')}>

      {!isFilterActive && (
        <span
          className="note-item__drag-handle"
          {...dragHandleProps}
          onClick={e => e.stopPropagation()}
        >
          <DragIndicatorIcon fontSize="small" />
        </span>
      )}

      <div className="note-item__info" onClick={onEdit}>
        <span className={`note-item__privacy-icon ${note.isPrivate ? 'note-item__privacy-icon--private' : 'note-item__privacy-icon--public'}`}>
          {note.isPrivate ? <LockOutlinedIcon fontSize="small" /> : <PublicOutlinedIcon fontSize="small" />}
        </span>
        <span className="note-item__title">{note.title}</span>
      </div>

      <div className="note-item__actions">
        <button className="note-item__btn note-item__btn--edit" onClick={onEdit}>
          <EditOutlinedIcon fontSize="small" />
        </button>
        <button className="note-item__btn note-item__btn--delete" onClick={onDelete}>
          <DeleteOutlineIcon fontSize="small" />
        </button>
      </div>
    </div>
  );
};

export default NoteItem;
