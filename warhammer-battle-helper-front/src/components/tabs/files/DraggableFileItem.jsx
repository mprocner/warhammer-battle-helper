import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDraggable } from '@dnd-kit/core';
import MapIcon from '@mui/icons-material/Map';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import { resolveFileUrl } from '../../../utils/fileUrl';

const DraggableFileItem = ({
  file,
  onPreview,
  onDelete,
  onHover,
  onAddToScene,
  onRename,
  renamingFile,
  renameFileValue,
  setRenameFileValue,
  onConfirmRename,
  onCancelRename,
}) => {
  const { t } = useTranslation();
  const isRenaming = renamingFile?.id === file.id;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file-${file.id}`,
    data: { type: 'file', file },
    disabled: isRenaming,
  });

  const handleMouseEnter = () => { if (!isDragging) onHover(file); };
  const handleMouseLeave = () => { onHover(null); };

  const handleClick = () => {
    if (!isDragging && !isRenaming) {
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
      className={`files-tab__item files-tab__item--file ${isDragging ? 'files-tab__item--dragging' : ''} ${isRenaming ? 'files-tab__item--renaming' : ''}`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...(isRenaming ? {} : listeners)}
      {...attributes}
    >
      <img
        src={resolveFileUrl(file.fileUrl)}
        alt={file.name}
        className="files-tab__item-thumbnail"
        draggable={false}
      />
      {isRenaming ? (
        <form
          className="files-tab__rename-form"
          onSubmit={onConfirmRename}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            className="files-tab__rename-input"
            value={renameFileValue}
            onChange={(e) => setRenameFileValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onCancelRename()}
            onBlur={onCancelRename}
            autoFocus
            maxLength={100}
          />
        </form>
      ) : (
        <span className="files-tab__item-name" title={file.name}>
          {file.name}
        </span>
      )}
      <div className="files-tab__item-actions">
        {isRenaming ? (
          <>
            <button
              className="list-action-btn list-action-btn--confirm"
              type="submit"
              form={`rename-file-${file.id}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); onConfirmRename(e); }}
              title={t('common.save')}
            >
              <CheckIcon fontSize="inherit" />
            </button>
            <button
              className="list-action-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); onCancelRename(); }}
              title={t('common.cancel')}
            >
              <CloseIcon fontSize="inherit" />
            </button>
          </>
        ) : (
          <>
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
              className="list-action-btn"
              onClick={(e) => { e.stopPropagation(); onHover(null); onRename(file, e); }}
              title={t('files.renameFile')}
            >
              <EditIcon fontSize="inherit" />
            </button>
            <button
              className="list-action-btn list-action-btn--delete"
              onClick={handleDelete}
              title={t('common.delete')}
            >
              <CloseIcon fontSize="inherit" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default DraggableFileItem;
