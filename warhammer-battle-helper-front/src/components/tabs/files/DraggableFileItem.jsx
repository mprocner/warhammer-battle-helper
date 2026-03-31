import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDraggable } from '@dnd-kit/core';
import MapIcon from '@mui/icons-material/Map';
import CloseIcon from '@mui/icons-material/Close';
import { getFileUrl } from './getFileUrl';

const DraggableFileItem = ({ file, onPreview, onDelete, onHover, onAddToScene }) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file-${file.id}`,
    data: { type: 'file', file },
  });

  const handleMouseEnter = () => { if (!isDragging) onHover(file); };
  const handleMouseLeave = () => { onHover(null); };

  const handleClick = () => {
    if (!isDragging) {
      onHover(null);
      onPreview(file);
    }
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onHover(null);
    onDelete(file);
  };

  return (
    <div
      ref={setNodeRef}
      className={`files-tab__item files-tab__item--file ${isDragging ? 'files-tab__item--dragging' : ''}`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...listeners}
      {...attributes}
    >
      <img
        src={getFileUrl(file.fileUrl)}
        alt={file.name}
        className="files-tab__item-thumbnail"
        draggable={false}
      />
      <span className="files-tab__item-name" title={file.name}>
        {file.name}
      </span>
      <div className="files-tab__item-actions">
        {onAddToScene && (
          <button
            className="list-action-btn"
            onClick={(e) => { e.stopPropagation(); onHover(null); onAddToScene(file); }}
            title={t('scenes.addToScene')}
          >
            <MapIcon fontSize="inherit" />
          </button>
        )}
        <button
          className="list-action-btn list-action-btn--delete"
          onClick={handleDelete}
          title={t('common.delete')}
        >
          <CloseIcon fontSize="inherit" />
        </button>
      </div>
    </div>
  );
};

export default DraggableFileItem;
