import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import FolderIcon from '@mui/icons-material/Folder';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';

const DroppableMusicFolderItem = ({ folder, onNavigate, onDelete, renamingFolder, renameValue, setRenameValue, setRenamingFolder, handleRenameFolder }) => {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: 'folder', folderId: folder.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`music-tab__track-item music-tab__folder-item ${isOver ? 'music-tab__folder-item--drop-target' : ''}`}
      onClick={() => onNavigate(folder)}
    >
      <div className="music-tab__track-info">
        <span className="music-tab__track-icon"><FolderIcon fontSize="inherit" /></span>
        {renamingFolder?.id === folder.id ? (
          <form onSubmit={handleRenameFolder} onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              className="music-tab__input music-tab__input--inline"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => setRenamingFolder(null)}
              autoFocus
            />
          </form>
        ) : (
          <span className="music-tab__track-name"><span className="music-tab__truncate">{folder.name}</span></span>
        )}
      </div>
      <div className="music-tab__track-actions">
        <button
          className="list-action-btn"
          onClick={(e) => { e.stopPropagation(); setRenamingFolder(folder); setRenameValue(folder.name); }}
          title={t('music.renameFolder')}
        >
          <EditIcon fontSize="inherit" />
        </button>
        <button
          className="list-action-btn list-action-btn--delete"
          onClick={(e) => { e.stopPropagation(); onDelete(folder); }}
          title={t('music.deleteFolder')}
        >
          <CloseIcon fontSize="inherit" />
        </button>
      </div>
    </div>
  );
};

export default DroppableMusicFolderItem;
