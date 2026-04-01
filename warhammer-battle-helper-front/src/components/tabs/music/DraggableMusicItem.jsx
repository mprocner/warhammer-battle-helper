import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDraggable } from '@dnd-kit/core';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import CloseIcon from '@mui/icons-material/Close';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import TrackName from './TrackName';

const DraggableMusicItem = ({
  file,
  onPlay,
  onPause,
  onDelete,
  onAddToPlaylist,
  isPlaying,
  playlists,
  addToPlaylistOpen,
  setAddToPlaylistOpen,
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
    id: `music-${file.id}`,
    data: { type: 'music', file },
    disabled: isRenaming,
  });

  return (
    <div
      ref={setNodeRef}
      className={`music-tab__track-item ${isPlaying ? 'music-tab__track-item--playing' : ''} ${isDragging ? 'music-tab__track-item--dragging' : ''} ${isRenaming ? 'music-tab__track-item--renaming' : ''}`}
      {...(isRenaming ? {} : listeners)}
      {...attributes}
    >
      <div className="music-tab__track-info">
        <span className="music-tab__track-icon"><MusicNoteIcon fontSize="inherit" /></span>
        {isRenaming ? (
          <form
            className="music-tab__rename-form"
            onSubmit={onConfirmRename}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              className="music-tab__rename-input"
              value={renameFileValue}
              onChange={(e) => setRenameFileValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && onCancelRename()}
              onBlur={onCancelRename}
              autoFocus
              maxLength={100}
            />
          </form>
        ) : (
          <TrackName name={file.name} />
        )}
      </div>
      <div className="music-tab__track-actions">
        {isRenaming ? (
          <>
            <button
              className="list-action-btn list-action-btn--confirm"
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
            {isPlaying ? (
              <button className="list-action-btn music-tab__track-btn--playback" onClick={(e) => { e.stopPropagation(); onPause(); }} title={t('music.pause')}><PauseIcon fontSize="inherit" /></button>
            ) : (
              <button className="list-action-btn music-tab__track-btn--playback music-tab__track-btn--play" onClick={(e) => { e.stopPropagation(); onPlay(file); }} title={t('music.play')}><PlayArrowIcon fontSize="inherit" /></button>
            )}
            <div className="music-tab__add-to-playlist-wrapper">
              <button
                className="list-action-btn"
                onClick={(e) => { e.stopPropagation(); setAddToPlaylistOpen(addToPlaylistOpen === file.id ? null : file.id); }}
                title={t('music.addToPlaylist')}
              >
                <PlaylistAddIcon fontSize="inherit" />
              </button>
              {addToPlaylistOpen === file.id && playlists.length > 0 && (
                <div className="music-tab__playlist-dropdown">
                  {playlists.map(pl => (
                    <button
                      key={pl.id}
                      className="music-tab__playlist-dropdown-item"
                      onClick={(e) => { e.stopPropagation(); onAddToPlaylist(pl.id, file.id); }}
                    >
                      {pl.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="list-action-btn"
              onClick={(e) => { e.stopPropagation(); onRename(file, e); }}
              title={t('music.renameFile')}
            >
              <EditIcon fontSize="inherit" />
            </button>
            <button className="list-action-btn list-action-btn--delete" onClick={(e) => { e.stopPropagation(); onDelete(file); }} title={t('common.delete')}><CloseIcon fontSize="inherit" /></button>
          </>
        )}
      </div>
    </div>
  );
};

export default DraggableMusicItem;
