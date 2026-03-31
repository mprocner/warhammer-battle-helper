import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import PortalTooltip from './PortalTooltip';
import SortableTrackItem from './SortableTrackItem';

const SortablePlaylistItem = ({
  playlist, isActive, expandedPlaylists, togglePlaylist, getPlaylistTracks,
  handlePlayPlaylist, handlePlayPlaylistFromTrack, handleStartEditPlaylist,
  handleDeletePlaylist, handleRemoveFromPlaylist, sensors, handleTrackDragEnd,
  activePlaylist, activeTrackIndex, musicState,
}) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: playlist.id,
  });
  const playlistNameRef = useRef(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const tracks = getPlaylistTracks(playlist);

  return (
    <div ref={setNodeRef} style={style} className={`music-tab__playlist-item ${isActive ? 'music-tab__playlist-item--active' : ''}`}>
      <div className="music-tab__playlist-header" onClick={() => togglePlaylist(playlist.id)}>
        <div className="music-tab__drag-handle" {...attributes} {...listeners} onClick={(e) => e.stopPropagation()}>
          <DragHandleIcon fontSize="inherit" />
        </div>
        <span className={`music-tab__chevron ${!expandedPlaylists[playlist.id] ? 'music-tab__chevron--collapsed' : ''}`}>&#9662;</span>
        <span className="music-tab__playlist-name" ref={playlistNameRef}><span className="music-tab__truncate">{playlist.name} ({tracks.length})</span></span>
        <PortalTooltip text={playlist.name} targetRef={playlistNameRef} />
        <div className="music-tab__playlist-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="list-action-btn music-tab__track-btn--play"
            onClick={() => handlePlayPlaylist(playlist)}
            disabled={tracks.length === 0}
            title={t('music.play')}
          >
            <PlayArrowIcon fontSize="inherit" />
          </button>
          <button className="list-action-btn" onClick={() => handleStartEditPlaylist(playlist)} title={t('music.editPlaylist')}>
            <EditIcon fontSize="inherit" />
          </button>
          <button className="list-action-btn list-action-btn--delete" onClick={() => handleDeletePlaylist(playlist)} title={t('common.delete')}>
            <CloseIcon fontSize="inherit" />
          </button>
        </div>
      </div>
      <div className={`music-tab__playlist-tracks ${!expandedPlaylists[playlist.id] ? 'music-tab__playlist-tracks--collapsed' : ''}`}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => handleTrackDragEnd(playlist.id, event)}>
          <SortableContext items={tracks.map(track => `${playlist.id}-${track.id}`)} strategy={verticalListSortingStrategy}>
            {tracks.map((track, index) => (
              <SortableTrackItem
                key={`${playlist.id}-${track.id}-${index}`}
                track={track}
                index={index}
                playlistId={playlist.id}
                handleRemoveFromPlaylist={handleRemoveFromPlaylist}
                handlePlayPlaylistFromTrack={handlePlayPlaylistFromTrack}
                isCurrentTrack={activePlaylist?.id === playlist.id && activeTrackIndex === index && musicState.isPlaying}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};

export default SortablePlaylistItem;
