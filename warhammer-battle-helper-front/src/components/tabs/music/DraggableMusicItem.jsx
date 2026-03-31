import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDraggable } from '@dnd-kit/core';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import CloseIcon from '@mui/icons-material/Close';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import TrackName from './TrackName';

const DraggableMusicItem = ({ file, onPlay, onPause, onDelete, onAddToPlaylist, isPlaying, playlists, addToPlaylistOpen, setAddToPlaylistOpen }) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `music-${file.id}`,
    data: { type: 'music', file },
  });

  return (
    <div
      ref={setNodeRef}
      className={`music-tab__track-item ${isPlaying ? 'music-tab__track-item--playing' : ''} ${isDragging ? 'music-tab__track-item--dragging' : ''}`}
      {...listeners}
      {...attributes}
    >
      <div className="music-tab__track-info">
        <span className="music-tab__track-icon"><MusicNoteIcon fontSize="inherit" /></span>
        <TrackName name={file.name} />
      </div>
      <div className="music-tab__track-actions">
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
        <button className="list-action-btn list-action-btn--delete" onClick={(e) => { e.stopPropagation(); onDelete(file); }} title={t('common.delete')}><CloseIcon fontSize="inherit" /></button>
      </div>
    </div>
  );
};

export default DraggableMusicItem;
