import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import RepeatIcon from '@mui/icons-material/Repeat';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import VolumeDownIcon from '@mui/icons-material/VolumeDown';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import { getMusic, uploadMusic, deleteMusic, createPlaylist, updatePlaylist, deletePlaylist, reorderPlaylists, playTrack, pauseTrack, stopTrack, setVolume, createMusicFolder, renameMusicFolder, deleteMusicFolder, moveMusicFile } from '../../api/music';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { getFileUrl, formatTime } from './music/utils';
import DroppableMusicBackButton from './music/DroppableMusicBackButton';
import DroppableMusicFolderItem from './music/DroppableMusicFolderItem';
import DraggableMusicItem from './music/DraggableMusicItem';
import SortablePlaylistItem from './music/SortablePlaylistItem';
import './MusicTab.css';

const MusicTab = ({ gameId, token, musicState, audioRef }) => {
  const { t } = useTranslation();
  const [musicFiles, setMusicFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folderPath, setFolderPath] = useState([]);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [draggingMusicFile, setDraggingMusicFile] = useState(null);
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

  // Files and folders for current directory
  const currentMusicFiles = useMemo(() =>
    musicFiles.filter(f => currentFolderId === null ? !f.folderId : f.folderId === currentFolderId),
    [musicFiles, currentFolderId]
  );

  const currentFolders = useMemo(() =>
    folders.filter(f => currentFolderId === null ? !f.parentId : f.parentId === currentFolderId)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [folders, currentFolderId]
  );

  const sortedMusicFiles = useMemo(
    () => [...currentMusicFiles]
      .filter(f => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [currentMusicFiles, searchQuery]
  );

  const parentFolderId = folderPath.length > 1 ? folderPath[folderPath.length - 2].id : null;

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
      setFolders(data.folders || []);
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

  // Sync activePlaylist when music was triggered externally with a playlistId (e.g. scene auto-play)
  useEffect(() => {
    if (!musicState.playlistId) return;
    if (activePlaylist?.id === musicState.playlistId) return;
    const playlist = playlists.find(p => p.id === musicState.playlistId);
    if (playlist) {
      setActivePlaylist(playlist);
      setActiveTrackIndex(musicState.trackIndex ?? 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicState.playlistId, musicState.trackIndex, playlists]);

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
  }, [gameId, activePlaylist, activeTrackIndex, musicFiles, loop, musicState.trackUrl, musicState.trackName]);

  const getPlaylistTracks = useCallback((playlist) => {
    if (!playlist) return [];
    return (playlist.tracks || [])
      .map(trackId => musicFiles.find(f => f.id === trackId))
      .filter(Boolean);
  }, [musicFiles]);

  // Folder navigation
  const navigateToFolder = (folder) => {
    setCurrentFolderId(folder.id);
    setFolderPath(prev => [...prev, folder]);
  };

  const navigateToBreadcrumb = (index) => {
    if (index === -1) {
      setCurrentFolderId(null);
      setFolderPath([]);
    } else {
      const folder = folderPath[index];
      setCurrentFolderId(folder.id);
      setFolderPath(folderPath.slice(0, index + 1));
    }
  };

  const navigateUp = () => {
    if (folderPath.length > 0) {
      const newPath = folderPath.slice(0, -1);
      const parentFolder = newPath[newPath.length - 1];
      setCurrentFolderId(parentFolder?.id || null);
      setFolderPath(newPath);
    }
  };

  // Folder CRUD
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const folder = await createMusicFolder(newFolderName.trim(), currentFolderId);
      setFolders(prev => [...prev, folder]);
      setNewFolderName('');
      setIsCreateFolderOpen(false);
    } catch (err) {
      setError(t('music.folderCreateError'));
    }
  };

  const handleRenameFolder = async (e) => {
    e.preventDefault();
    if (!renameValue.trim() || !renamingFolder) return;
    try {
      await renameMusicFolder(renamingFolder.id, renameValue.trim());
      setFolders(prev => prev.map(f =>
        f.id === renamingFolder.id ? { ...f, name: renameValue.trim() } : f
      ));
      setRenamingFolder(null);
      setRenameValue('');
    } catch (err) {
      setError(t('music.folderRenameError'));
    }
  };

  const handleDeleteFolder = async (folder) => {
    const hasContents = musicFiles.some(f => f.folderId === folder.id) ||
                       folders.some(f => f.parentId === folder.id);
    const message = hasContents
      ? t('music.folderHasContents')
      : t('music.deleteFolder') + ` "${folder.name}"?`;
    if (!window.confirm(message)) return;
    try {
      await deleteMusicFolder(folder.id, hasContents);
      setFolders(prev => prev.filter(f => f.id !== folder.id && f.parentId !== folder.id));
      if (hasContents) {
        setMusicFiles(prev => prev.filter(f => f.folderId !== folder.id));
      }
    } catch (err) {
      setError(t('music.folderDeleteError'));
    }
  };

  // Library DnD handlers
  const handleLibraryDragStart = (event) => {
    const { active } = event;
    if (active.data.current?.type === 'music') {
      setDraggingMusicFile(active.data.current.file);
    }
  };

  const handleLibraryDragEnd = async (event) => {
    const { active, over } = event;
    setDraggingMusicFile(null);
    if (!over || !active.data.current?.file) return;

    const file = active.data.current.file;
    const targetData = over.data.current;
    if (!targetData) return;

    let targetFolderId = null;
    if (targetData.type === 'folder') {
      targetFolderId = targetData.folderId;
    } else if (targetData.type === 'parent') {
      targetFolderId = targetData.folderId;
    } else {
      return;
    }

    if (file.folderId === targetFolderId || (!file.folderId && !targetFolderId)) return;

    try {
      await moveMusicFile(file.id, targetFolderId);
      setMusicFiles(prev => prev.map(f =>
        f.id === file.id ? { ...f, folderId: targetFolderId } : f
      ));
    } catch (err) {
      setError(t('music.moveMusicError'));
    }
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      await uploadMusic(files, currentFolderId);
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

  const isTrackPlaying = (file) => {
    return musicState.isPlaying && musicState.trackUrl === getFileUrl(file.fileUrl);
  };

  if (loading) {
    return <div className="music-tab"><p className="music-tab__loading">{t('common.loading')}</p></div>;
  }

  return (
    <div className="music-tab">
      <div className="music-tab__header">
        <h3 className="music-tab__title">{t('rightPanel.tabs.music')}</h3>
      </div>

      {error && (
        <div className="music-tab__error">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="music-tab__error-close"><CloseIcon fontSize="inherit" /></button>
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
            <button className="music-tab__control-btn music-tab__control-btn--playback" onClick={handlePreviousTrack} title={t('music.previous')}><SkipPreviousIcon fontSize="inherit" /></button>
            {musicState.isPlaying ? (
              <button className="music-tab__control-btn music-tab__control-btn--playback" onClick={handlePause} title={t('music.pause')}><PauseIcon fontSize="inherit" /></button>
            ) : (
              <button className="music-tab__control-btn music-tab__control-btn--playback" onClick={() => handleResume()} title={t('music.play')}><PlayArrowIcon fontSize="inherit" /></button>
            )}
            <button className="music-tab__control-btn" onClick={handleStop} title={t('music.stop')}><StopIcon fontSize="inherit" /></button>
            <button
              className={`music-tab__control-btn ${loop ? 'music-tab__control-btn--active' : ''}`}
              onClick={() => setLoop(!loop)}
              title={t('music.loop')}
            >
              <RepeatIcon fontSize="inherit" />
            </button>
            <button className="music-tab__control-btn music-tab__control-btn--playback" onClick={handleNextTrack} title={t('music.next')}><SkipNextIcon fontSize="inherit" /></button>
          </div>
        </section>
      )}

      {/* GM Volume Control */}
      <section className="music-tab__section">
        <h4 className="music-tab__section-title">{t('music.gmVolume')}</h4>
        <div className="music-tab__volume-control">
          <span className="music-tab__volume-icon"><VolumeDownIcon fontSize="inherit" /></span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={musicState.gmVolume}
            onChange={handleVolumeChange}
            className="music-tab__volume-slider"
          />
          <span className="music-tab__volume-icon"><VolumeUpIcon fontSize="inherit" /></span>
          <span className="music-tab__volume-value">{Math.round(musicState.gmVolume * 100)}%</span>
        </div>
      </section>

      {/* Music Library Section */}
      <DndContext
        sensors={sensors}
        onDragStart={handleLibraryDragStart}
        onDragEnd={handleLibraryDragEnd}
      >
        <section className="music-tab__section">
          <div className="music-tab__section-header music-tab__section-header--clickable" onClick={() => toggleSection('library')}>
            <h4 className="music-tab__section-title">
              <span className={`music-tab__chevron ${collapsedSections.library ? 'music-tab__chevron--collapsed' : ''}`}>&#9662;</span>
              {t('music.title')} ({sortedMusicFiles.length})
            </h4>
            <button
              className="music-tab__add-btn"
              onClick={(e) => { e.stopPropagation(); setSearchOpen(prev => { if (prev) setSearchQuery(''); return !prev; }); }}
              title={t('music.searchPlaceholder')}
            >
              <SearchIcon fontSize="inherit" />
            </button>
            <button
              className="music-tab__add-btn"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              disabled={uploading}
              title={t('music.uploadMusic')}
            >
              {uploading ? '...' : '+'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav"
              multiple
              onChange={handleUpload}
              onClick={(e) => e.stopPropagation()}
              className="music-tab__file-input"
            />
          </div>
          <div className={`music-tab__section-body ${collapsedSections.library ? 'music-tab__section-body--collapsed' : ''}`}>
            {/* New folder button */}
            <button
              className="music-tab__new-folder-btn"
              onClick={() => setIsCreateFolderOpen(prev => !prev)}
            >
              + {t('music.createFolder')}
            </button>

            {/* New folder form */}
            {isCreateFolderOpen && (
              <form onSubmit={handleCreateFolder} className="music-tab__folder-form">
                <input
                  type="text"
                  className="music-tab__input"
                  placeholder={t('music.folderNamePlaceholder')}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                />
                <div className="music-tab__folder-form-actions">
                  <button type="button" onClick={() => { setIsCreateFolderOpen(false); setNewFolderName(''); }}>
                    {t('common.cancel')}
                  </button>
                  <button type="submit" disabled={!newFolderName.trim()}>
                    {t('common.create')}
                  </button>
                </div>
              </form>
            )}

            {/* Search input */}
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

            {/* Breadcrumb */}
            <div className="music-tab__breadcrumb">
              <span
                className="music-tab__breadcrumb-item music-tab__breadcrumb-item--clickable"
                onClick={() => navigateToBreadcrumb(-1)}
              >
                {t('music.root')}
              </span>
              {folderPath.map((folder, index) => (
                <React.Fragment key={folder.id}>
                  <span className="music-tab__breadcrumb-sep">/</span>
                  <span
                    className="music-tab__breadcrumb-item music-tab__breadcrumb-item--clickable"
                    onClick={() => navigateToBreadcrumb(index)}
                  >
                    {folder.name}
                  </span>
                </React.Fragment>
              ))}
            </div>

            <div className="music-tab__track-list">
              {/* Back button when in subfolder */}
              {currentFolderId && (
                <DroppableMusicBackButton parentFolderId={parentFolderId} onNavigateUp={navigateUp} />
              )}

              {/* Folders */}
              {currentFolders.map(folder => (
                <DroppableMusicFolderItem
                  key={folder.id}
                  folder={folder}
                  onNavigate={navigateToFolder}
                  onDelete={handleDeleteFolder}
                  renamingFolder={renamingFolder}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  setRenamingFolder={setRenamingFolder}
                  handleRenameFolder={handleRenameFolder}
                />
              ))}

              {/* Music files */}
              {sortedMusicFiles.map(file => (
                <DraggableMusicItem
                  key={file.id}
                  file={file}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onDelete={handleDelete}
                  onAddToPlaylist={handleAddToPlaylist}
                  isPlaying={isTrackPlaying(file)}
                  playlists={playlists}
                  addToPlaylistOpen={addToPlaylistOpen}
                  setAddToPlaylistOpen={setAddToPlaylistOpen}
                />
              ))}

              {/* Empty state */}
              {currentFolders.length === 0 && sortedMusicFiles.length === 0 && !currentFolderId && (
                <p className="music-tab__empty">{t('music.noFiles')}</p>
              )}
            </div>
          </div>
        </section>

        <DragOverlay dropAnimation={null}>
          {draggingMusicFile && (
            <div className="music-tab__drag-overlay">
              <MusicNoteIcon fontSize="inherit" />
              <span>{draggingMusicFile.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

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
