import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CloseIcon from '@mui/icons-material/Close';
import PortalTooltip from './PortalTooltip';

const SortableTrackItem = ({ track, index, playlistId, handleRemoveFromPlaylist, handlePlayPlaylistFromTrack, isCurrentTrack }) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${playlistId}-${track.id}`,
  });
  const nameRef = useRef(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="music-tab__playlist-track">
      <div className="music-tab__drag-handle" {...attributes} {...listeners}>
        <DragHandleIcon fontSize="inherit" />
      </div>
      <span className="music-tab__playlist-track-num">{index + 1}.</span>
      <span className="music-tab__playlist-track-name" ref={nameRef}><span className="music-tab__truncate">{track.name}</span></span>
      <PortalTooltip text={track.name} targetRef={nameRef} />
      <button
        className={`list-action-btn music-tab__track-btn--play ${isCurrentTrack ? 'music-tab__track-btn--current' : ''}`}
        onClick={() => handlePlayPlaylistFromTrack(playlistId, index)}
        title={t('music.play')}
      >
        <PlayArrowIcon fontSize="inherit" />
      </button>
      <button
        className="list-action-btn list-action-btn--delete"
        onClick={() => handleRemoveFromPlaylist(playlistId, track.id)}
        title={t('common.delete')}
      >
        <CloseIcon fontSize="inherit" />
      </button>
    </div>
  );
};

export default SortableTrackItem;
