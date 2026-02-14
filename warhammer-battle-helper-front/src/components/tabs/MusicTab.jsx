import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getMusic, uploadMusic, deleteMusic, createPlaylist, updatePlaylist, deletePlaylist, reorderPlaylists, playTrack, pauseTrack, stopTrack, setVolume } from '../../api/music';
import { getApiUrl } from '../../api/axios';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import './MusicTab.css';

const getFileUrl = (fileUrl) => {
  if (!fileUrl) return '';
  return fileUrl.startsWith('http') ? fileUrl : `${getApiUrl()}${fileUrl}`;
};

const SortableTrackItem = ({ track, index, playlistId, handleRemoveFromPlaylist, handlePlayPlaylistFromTrack, isCurrentTrack, t }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: `${playlistId}-${track.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div ref={setNodeRef} style={style} className="music-tab__playlist-track">
      <div className="music-tab__drag-handle" {...attributes} {...listeners}>
        <span className="music-tab__drag-icon">⋮⋮</span>
      </div>
      <span className="music-tab__playlist-track-num">{index + 1}.</span>
      <span className="music-tab__playlist-track-name" data-title={track.name}><span className="music-tab__truncate">{track.name}</span></span>
      <button
        className={`music-tab__track-btn music-tab__track-btn--play ${isCurrentTrack ? 'music-tab__track-btn--current' : ''}`}
        onClick={() => handlePlayPlaylistFromTrack(playlistId, index)}
        data-title={t('music.play')}
      >
        ▶
      </button>
      <button
        className="music-tab__track-btn music-tab__track-btn--delete"
        onClick={() => handleRemoveFromPlaylist(playlistId, track.id)}
        data-title={t('common.delete')}
      >
        ✕
      </button>
    </div>
  );
};

const SortablePlaylistItem = ({ playlist, isActive, expandedPlaylists, togglePlaylist, getPlaylistTracks, handlePlayPlaylist, handlePlayPlaylistFromTrack, handleStartEditPlaylist, handleDeletePlaylist, handleRemoveFromPlaylist, sensors, handleTrackDragEnd, activePlaylist, activeTrackIndex, musicState, t }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: playlist.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const tracks = getPlaylistTracks(playlist);

  return (
    <div ref={setNodeRef} style={style} className={`music-tab__playlist-item ${isActive ? 'music-tab__playlist-item--active' : ''}`}>
      <div className="music-tab__playlist-header" onClick={() => togglePlaylist(playlist.id)}>
        <div className="music-tab__drag-handle" {...attributes} {...listeners} onClick={(e) => e.stopPropagation()}>
          <span className="music-tab__drag-icon">⋮⋮</span>
        </div>
        <span className={`music-tab__chevron ${!expandedPlaylists[playlist.id] ? 'music-tab__chevron--collapsed' : ''}`}>&#9662;</span>
        <span className="music-tab__playlist-name" data-title={playlist.name}><span className="music-tab__truncate">{playlist.name} ({tracks.length})</span></span>
        <div className="music-tab__playlist-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="music-tab__track-btn music-tab__track-btn--play"
            onClick={() => handlePlayPlaylist(playlist)}
            disabled={tracks.length === 0}
            data-title={t('music.play')}
          >
            ▶
          </button>
          <button
            className="music-tab__track-btn"
            onClick={() => handleStartEditPlaylist(playlist)}
            data-title={t('music.editPlaylist')}
          >
            ✎
          </button>
          <button
            className="music-tab__track-btn music-tab__track-btn--delete"
            onClick={() => handleDeletePlaylist(playlist)}
            data-title={t('common.delete')}
          >
            ✕
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
                t={t}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};

const MusicTab = ({ gameId, token, musicState, audioRef }) => {
  const { t } = useTranslation();
  const [musicFiles, setMusicFiles] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activePlaylist, setActivePlaylist] = useState(null);
  const [activeTrackIndex, setActiveTrackIndex] = useState(-1);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedTracksForPlaylist, setSelectedTracksForPlaylist] = useState([]);
  const [addToPlaylistOpen, setAddToPlaylistOpen] = useState(null);
  const [loop, setLoop] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [expandedPlaylists, setExpandedPlaylists] = useState({});
  const [editingPlaylist, setEditingPlaylist] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const sortedMusicFiles = useMemo(
    () => [...musicFiles]
      .filter(f => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [musicFiles, searchQuery]
  );

  const handlePlaylistDragEnd = async (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setPlaylists(prev => {
        const oldIndex = prev.findIndex(p => p.id === active.id);
        const newIndex = prev.findIndex(p => p.id === over.id);
        const newOrder = arrayMove(prev, oldIndex, newIndex);
        const playlistIds = newOrder.map(p => p.id);
        reorderPlaylists(playlistIds).catch(() => fetchMusic());
        return newOrder;
      });
    }
  };

  const handleTrackDragEnd = async (playlistId, event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    const tracks = playlist.tracks || [];
    const activeTrackId = String(active.id).replace(`${playlistId}-`, '');
    const overTrackId = String(over.id).replace(`${playlistId}-`, '');
    const oldIndex = tracks.indexOf(activeTrackId);
    const newIndex = tracks.indexOf(overTrackId);
    if (oldIndex === -1 || newIndex === -1) return;
    const newTracks = arrayMove(tracks, oldIndex, newIndex);
    setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, tracks: newTracks } : p));
    try {
      await updatePlaylist(playlistId, playlist.name, newTracks);
    } catch {
      fetchMusic();
    }
  };

  const toggleSection = (section) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const togglePlaylist = (playlistId) => {
    setExpandedPlaylists(prev => ({ ...prev, [playlistId]: !prev[playlistId] }));
  };

  const fetchMusic = useCallback(async () => {
    try {
      const data = await getMusic();
      setMusicFiles(data.music || []);
      setPlaylists(data.playlists || []);
      setError(null);
    } catch (err) {
      setError(t('music.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchMusic();
  }, [fetchMusic]);

  // Track audio time updates
  useEffect(() => {
    const audio = audioRef.current;
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration || 0);
    const handleEnded = () => {
      if (activePlaylist && activeTrackIndex >= 0) {
        // Playlist mode
        const playlistTracks = getPlaylistTracks(activePlaylist);
        const nextIndex = activeTrackIndex + 1;
        if (nextIndex < playlistTracks.length) {
          const nextTrack = playlistTracks[nextIndex];
          setActiveTrackIndex(nextIndex);
          playTrack(gameId, getFileUrl(nextTrack.fileUrl), nextTrack.name, 0).catch(console.error);
        } else if (loop && playlistTracks.length > 0) {
          // Loop: restart playlist from first track
          setActiveTrackIndex(0);
          playTrack(gameId, getFileUrl(playlistTracks[0].fileUrl), playlistTracks[0].name, 0).catch(console.error);
        } else {
          setActivePlaylist(null);
          setActiveTrackIndex(-1);
          stopTrack(gameId).catch(console.error);
        }
      } else if (loop && musicState.trackUrl) {
        // Single track loop: replay from beginning
        playTrack(gameId, musicState.trackUrl, musicState.trackName, 0).catch(console.error);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, activePlaylist, activeTrackIndex, musicFiles, loop]);

  const getPlaylistTracks = useCallback((playlist) => {
    if (!playlist) return [];
    return (playlist.tracks || [])
      .map(trackId => musicFiles.find(f => f.id === trackId))
      .filter(Boolean);
  }, [musicFiles]);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      await uploadMusic(files);
      await fetchMusic();
    } catch (err) {
      setError(t('music.uploadError'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (file) => {
    if (!window.confirm(t('music.confirmDelete', { name: file.name }))) return;
    try {
      await deleteMusic(file.id);
      await fetchMusic();
    } catch (err) {
      setError(t('music.deleteError'));
    }
  };

  const handlePlay = async (file) => {
    setActivePlaylist(null);
    setActiveTrackIndex(-1);
    try {
      await playTrack(gameId, getFileUrl(file.fileUrl), file.name, 0);
    } catch (err) {
      setError(t('music.playError'));
    }
  };

  const handleResume = async () => {
    if (!musicState.trackUrl) return;
    try {
      await playTrack(gameId, musicState.trackUrl, musicState.trackName, audioRef.current.currentTime);
    } catch (err) {
      setError(t('music.playError'));
    }
  };

  const handlePause = async () => {
    try {
      await pauseTrack(gameId, audioRef.current.currentTime);
    } catch (err) {
      setError(t('music.pauseError'));
    }
  };

  const handleStop = async () => {
    setActivePlaylist(null);
    setActiveTrackIndex(-1);
    try {
      await stopTrack(gameId);
    } catch (err) {
      setError(t('music.stopError'));
    }
  };

  const handleVolumeChange = async (e) => {
    const vol = parseFloat(e.target.value);
    try {
      await setVolume(gameId, vol);
    } catch (err) {
      console.error('Failed to set volume:', err);
    }
  };

  const handlePlayPlaylist = async (playlist) => {
    const tracks = getPlaylistTracks(playlist);
    if (tracks.length === 0) return;

    setActivePlaylist(playlist);
    setActiveTrackIndex(0);
    try {
      await playTrack(gameId, getFileUrl(tracks[0].fileUrl), tracks[0].name, 0);
    } catch (err) {
      setError(t('music.playError'));
    }
  };

  const handlePlayPlaylistFromTrack = async (playlistId, trackIndex) => {
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    const tracks = getPlaylistTracks(playlist);
    if (trackIndex < 0 || trackIndex >= tracks.length) return;

    setActivePlaylist(playlist);
    setActiveTrackIndex(trackIndex);
    try {
      await playTrack(gameId, getFileUrl(tracks[trackIndex].fileUrl), tracks[trackIndex].name, 0);
    } catch (err) {
      setError(t('music.playError'));
    }
  };

  const handleNextTrack = async () => {
    if (activePlaylist) {
      const tracks = getPlaylistTracks(activePlaylist);
      if (tracks.length === 0) return;
      const nextIndex = (activeTrackIndex + 1) % tracks.length;
      setActiveTrackIndex(nextIndex);
      try {
        await playTrack(gameId, getFileUrl(tracks[nextIndex].fileUrl), tracks[nextIndex].name, 0);
      } catch (err) {
        setError(t('music.playError'));
      }
    } else {
      const currentIndex = sortedMusicFiles.findIndex(f => getFileUrl(f.fileUrl) === musicState.trackUrl);
      if (currentIndex === -1 || sortedMusicFiles.length === 0) return;
      const nextIndex = (currentIndex + 1) % sortedMusicFiles.length;
      try {
        await playTrack(gameId, getFileUrl(sortedMusicFiles[nextIndex].fileUrl), sortedMusicFiles[nextIndex].name, 0);
      } catch (err) {
        setError(t('music.playError'));
      }
    }
  };

  const handlePreviousTrack = async () => {
    if (activePlaylist) {
      const tracks = getPlaylistTracks(activePlaylist);
      if (tracks.length === 0) return;
      const prevIndex = (activeTrackIndex - 1 + tracks.length) % tracks.length;
      setActiveTrackIndex(prevIndex);
      try {
        await playTrack(gameId, getFileUrl(tracks[prevIndex].fileUrl), tracks[prevIndex].name, 0);
      } catch (err) {
        setError(t('music.playError'));
      }
    } else {
      const currentIndex = sortedMusicFiles.findIndex(f => getFileUrl(f.fileUrl) === musicState.trackUrl);
      if (currentIndex === -1 || sortedMusicFiles.length === 0) return;
      const prevIndex = (currentIndex - 1 + sortedMusicFiles.length) % sortedMusicFiles.length;
      try {
        await playTrack(gameId, getFileUrl(sortedMusicFiles[prevIndex].fileUrl), sortedMusicFiles[prevIndex].name, 0);
      } catch (err) {
        setError(t('music.playError'));
      }
    }
  };

  const handleStartEditPlaylist = (playlist) => {
    setEditingPlaylist(playlist);
    setNewPlaylistName(playlist.name);
    setSelectedTracksForPlaylist(playlist.tracks.map(t => t.id || t));
    setShowCreatePlaylist(true);
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      if (editingPlaylist) {
        await updatePlaylist(editingPlaylist.id, newPlaylistName.trim(), selectedTracksForPlaylist);
      } else {
        await createPlaylist(newPlaylistName.trim(), selectedTracksForPlaylist);
      }
      setNewPlaylistName('');
      setSelectedTracksForPlaylist([]);
      setShowCreatePlaylist(false);
      setEditingPlaylist(null);
      await fetchMusic();
    } catch (err) {
      setError(editingPlaylist ? t('music.updatePlaylistError') : t('music.createPlaylistError'));
    }
  };

  const handleDeletePlaylist = async (playlist) => {
    if (!window.confirm(t('music.confirmDeletePlaylist', { name: playlist.name }))) return;
    try {
      await deletePlaylist(playlist.id);
      if (activePlaylist?.id === playlist.id) {
        setActivePlaylist(null);
        setActiveTrackIndex(-1);
      }
      await fetchMusic();
    } catch (err) {
      setError(t('music.deletePlaylistError'));
    }
  };

  const handleAddToPlaylist = async (playlistId, trackId) => {
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    const newTracks = [...(playlist.tracks || []), trackId];
    try {
      await updatePlaylist(playlistId, playlist.name, newTracks);
      setAddToPlaylistOpen(null);
      await fetchMusic();
    } catch (err) {
      setError(t('music.updatePlaylistError'));
    }
  };

  const handleRemoveFromPlaylist = async (playlistId, trackId) => {
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    const newTracks = (playlist.tracks || []).filter(t => t !== trackId);
    try {
      await updatePlaylist(playlistId, playlist.name, newTracks);
      await fetchMusic();
    } catch (err) {
      setError(t('music.updatePlaylistError'));
    }
  };

  const toggleTrackForPlaylist = (trackId) => {
    setSelectedTracksForPlaylist(prev =>
      prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId]
    );
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isTrackPlaying = (file) => {
    return musicState.isPlaying && musicState.trackUrl === getFileUrl(file.fileUrl);
  };

  if (loading) {
    return <div className="music-tab"><p className="music-tab__loading">{t('common.loading')}</p></div>;
  }

  return (
    <div className="music-tab">
      {error && (
        <div className="music-tab__error">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="music-tab__error-close">&times;</button>
        </div>
      )}

      {/* Now Playing */}
      {musicState.trackName && (
        <section className="music-tab__section music-tab__now-playing">
          <div className="music-tab__now-playing-info">
            <span className="music-tab__now-playing-label">
              {musicState.isPlaying ? t('music.nowPlaying') : t('music.paused')}:
            </span>
            <span className="music-tab__now-playing-name">{musicState.trackName}</span>
          </div>
          <div className="music-tab__progress">
            <span className="music-tab__time">{formatTime(currentTime)}</span>
            <div
              className="music-tab__progress-bar"
              onClick={(e) => {
                if (duration > 0 && musicState.trackUrl) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const newTime = (clickX / rect.width) * duration;
                  playTrack(gameId, musicState.trackUrl, musicState.trackName, newTime).catch(console.error);
                }
              }}
            >
              <div
                className="music-tab__progress-fill"
                style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
              />
            </div>
            <span className="music-tab__time">{formatTime(duration)}</span>
          </div>
          <div className="music-tab__playback-controls">
            <button className="music-tab__control-btn music-tab__control-btn--playback" onClick={handlePreviousTrack} data-title={t('music.previous')}>⏮</button>
            {musicState.isPlaying ? (
              <button className="music-tab__control-btn music-tab__control-btn--playback" onClick={handlePause} data-title={t('music.pause')}>⏸</button>
            ) : (
              <button className="music-tab__control-btn music-tab__control-btn--playback" onClick={() => handleResume()} data-title={t('music.play')}>▶</button>
            )}
            <button className="music-tab__control-btn" onClick={handleStop} data-title={t('music.stop')}>⏹</button>
            <button
              className={`music-tab__control-btn ${loop ? 'music-tab__control-btn--active' : ''}`}
              onClick={() => setLoop(!loop)}
              data-title={t('music.loop')}
            >
              🔁
            </button>
            <button className="music-tab__control-btn music-tab__control-btn--playback" onClick={handleNextTrack} data-title={t('music.next')}>⏭</button>
          </div>
        </section>
      )}

      {/* GM Volume Control */}
      <section className="music-tab__section">
        <h4 className="music-tab__section-title">{t('music.gmVolume')}</h4>
        <div className="music-tab__volume-control">
          <span className="music-tab__volume-icon">🔈</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={musicState.gmVolume}
            onChange={handleVolumeChange}
            className="music-tab__volume-slider"
          />
          <span className="music-tab__volume-icon">🔊</span>
          <span className="music-tab__volume-value">{Math.round(musicState.gmVolume * 100)}%</span>
        </div>
      </section>

      {/* Music Files List */}
      <section className="music-tab__section">
        <div className="music-tab__section-header music-tab__section-header--clickable" onClick={() => toggleSection('library')}>
          <h4 className="music-tab__section-title">
            <span className={`music-tab__chevron ${collapsedSections.library ? 'music-tab__chevron--collapsed' : ''}`}>&#9662;</span>
            {t('music.title')} ({sortedMusicFiles.length})
          </h4>
          <button
            className="music-tab__add-btn"
            onClick={(e) => { e.stopPropagation(); setSearchOpen(prev => { if (prev) setSearchQuery(''); return !prev; }); }}
            data-title={t('music.searchPlaceholder')}
          >
            🔍
          </button>
          <button
            className="music-tab__add-btn"
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            disabled={uploading}
            data-title={t('music.uploadMusic')}
          >
            {uploading ? '...' : '+'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav"
            multiple
            onChange={handleUpload}
            className="music-tab__file-input"
          />
        </div>
        <div className={`music-tab__section-body ${collapsedSections.library ? 'music-tab__section-body--collapsed' : ''}`}>
          {searchOpen && (
            <div style={{ marginBottom: 8 }}>
              <input
                type="text"
                className="music-tab__input"
                placeholder={t('music.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
          )}
          {sortedMusicFiles.length === 0 ? (
            <p className="music-tab__empty">{t('music.noFiles')}</p>
          ) : (
            <div className="music-tab__track-list">
              {sortedMusicFiles.map(file => (
                <div key={file.id} className={`music-tab__track-item ${isTrackPlaying(file) ? 'music-tab__track-item--playing' : ''}`}>
                  <div className="music-tab__track-info">
                    <span className="music-tab__track-name" data-title={file.name}><span className="music-tab__truncate">{file.name}</span></span>
                  </div>
                  <div className="music-tab__track-actions">
                    {isTrackPlaying(file) ? (
                      <button className="music-tab__track-btn music-tab__track-btn--playback" onClick={handlePause} data-title={t('music.pause')}>⏸</button>
                    ) : (
                      <button className="music-tab__track-btn music-tab__track-btn--playback music-tab__track-btn--play" onClick={() => handlePlay(file)} data-title={t('music.play')}>▶</button>
                    )}
                    <div className="music-tab__add-to-playlist-wrapper">
                      <button
                        className="music-tab__track-btn"
                        onClick={() => setAddToPlaylistOpen(addToPlaylistOpen === file.id ? null : file.id)}
                        data-title={t('music.addToPlaylist')}
                      >
                        +📋
                      </button>
                      {addToPlaylistOpen === file.id && playlists.length > 0 && (
                        <div className="music-tab__playlist-dropdown">
                          {playlists.map(pl => (
                            <button
                              key={pl.id}
                              className="music-tab__playlist-dropdown-item"
                              onClick={() => handleAddToPlaylist(pl.id, file.id)}
                            >
                              {pl.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button className="music-tab__track-btn music-tab__track-btn--delete" onClick={() => handleDelete(file)} data-title={t('common.delete')}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Playlists Section */}
      <section className="music-tab__section">
        <div className="music-tab__section-header music-tab__section-header--clickable" onClick={() => toggleSection('playlists')}>
          <h4 className="music-tab__section-title">
            <span className={`music-tab__chevron ${collapsedSections.playlists ? 'music-tab__chevron--collapsed' : ''}`}>&#9662;</span>
            {t('music.playlists')}
          </h4>
          <button
            className="music-tab__create-btn"
            onClick={(e) => { e.stopPropagation(); setShowCreatePlaylist(!showCreatePlaylist); setEditingPlaylist(null); setNewPlaylistName(''); setSelectedTracksForPlaylist([]); }}
          >
            {showCreatePlaylist ? t('common.cancel') : t('music.createPlaylist')}
          </button>
        </div>
        <div className={`music-tab__section-body ${collapsedSections.playlists ? 'music-tab__section-body--collapsed' : ''}`}>
        {showCreatePlaylist && (
          <div className="music-tab__create-playlist">
            <input
              type="text"
              className="music-tab__input"
              placeholder={t('music.playlistNamePlaceholder')}
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
            />
            {musicFiles.length > 0 && (
              <div className="music-tab__track-select">
                {musicFiles.map(file => (
                  <label key={file.id} className="music-tab__track-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedTracksForPlaylist.includes(file.id)}
                      onChange={() => toggleTrackForPlaylist(file.id)}
                    />
                    <span>{file.name}</span>
                  </label>
                ))}
              </div>
            )}
            <button
              className="music-tab__submit-btn"
              onClick={handleCreatePlaylist}
              disabled={!newPlaylistName.trim()}
            >
              {editingPlaylist ? t('common.save') : t('common.create')}
            </button>
          </div>
        )}

        {playlists.length === 0 && !showCreatePlaylist ? (
          <p className="music-tab__empty">{t('music.noPlaylists')}</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePlaylistDragEnd}>
            <SortableContext items={playlists.map(p => p.id)} strategy={verticalListSortingStrategy}>
              <div className="music-tab__playlist-list">
                {playlists.map(playlist => (
                  <SortablePlaylistItem
                    key={playlist.id}
                    playlist={playlist}
                    isActive={activePlaylist?.id === playlist.id}
                    expandedPlaylists={expandedPlaylists}
                    togglePlaylist={togglePlaylist}
                    getPlaylistTracks={getPlaylistTracks}
                    handlePlayPlaylist={handlePlayPlaylist}
                    handlePlayPlaylistFromTrack={handlePlayPlaylistFromTrack}
                    handleStartEditPlaylist={handleStartEditPlaylist}
                    handleDeletePlaylist={handleDeletePlaylist}
                    handleRemoveFromPlaylist={handleRemoveFromPlaylist}
                    sensors={sensors}
                    handleTrackDragEnd={handleTrackDragEnd}
                    activePlaylist={activePlaylist}
                    activeTrackIndex={activeTrackIndex}
                    musicState={musicState}
                    t={t}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        </div>
      </section>
    </div>
  );
};

export default MusicTab;
