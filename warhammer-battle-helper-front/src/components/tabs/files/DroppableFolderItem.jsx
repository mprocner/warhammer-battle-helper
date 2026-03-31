import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import FolderIcon from '@mui/icons-material/Folder';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';

const DroppableFolderItem = ({ folder, onNavigate, onRename, onDelete, renamingFolder, renameValue, setRenameValue, setRenamingFolder, handleRenameFolder }) => {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: 'folder', folderId: folder.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`files-tab__item files-tab__item--folder ${isOver ? 'files-tab__item--drop-target' : ''}`}
      onClick={() => onNavigate(folder)}
    >
      <span className="files-tab__item-icon"><FolderIcon fontSize="inherit" /></span>
      {renamingFolder?.id === folder.id ? (
        <form onSubmit={handleRenameFolder} className="files-tab__rename-form">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => setRenamingFolder(null)}
            autoFocus
          />
        </form>
      ) : (
        <span className="files-tab__item-name">{folder.name}</span>
      )}
      <div className="files-tab__item-actions">
        <button
          className="list-action-btn"
          onClick={(e) => onRename(folder, e)}
          title={t('files.renameFolder')}
        >
          <EditIcon fontSize="inherit" />
        </button>
        <button
          className="list-action-btn list-action-btn--delete"
          onClick={(e) => { e.stopPropagation(); onDelete(folder); }}
          title={t('common.delete')}
        >
          <CloseIcon fontSize="inherit" />
        </button>
      </div>
    </div>
  );
};

export default DroppableFolderItem;
