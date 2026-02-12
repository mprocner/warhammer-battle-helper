import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getMusic, uploadMusic, deleteMusic, createPlaylist, updatePlaylist, deletePlaylist, playTrack, pauseTrack, stopTrack, setVolume } from '../../api/music';
import { getApiUrl } from '../../api/axios';
import './MusicTab.css';

const getFileUrl = (fileUrl) => {
  if (!fileUrl) return '';
  return fileUrl.startsWith('http') ? fileUrl : `${getApiUrl()}${fileUrl}`;
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
  const fileInputRef = useRef(null);

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

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      await createPlaylist(newPlaylistName.trim(), selectedTracksForPlaylist);
      setNewPlaylistName('');
      setSelectedTracksForPlaylist([]);
      setShowCreatePlaylist(false);
      await fetchMusic();
    } catch (err) {
      setError(t('music.createPlaylistError'));
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
            <div className="music-tab__progress-bar">
              <div
                className="music-tab__progress-fill"
                style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
              />
            </div>
            <span className="music-tab__time">{formatTime(duration)}</span>
          </div>
          <div className="music-tab__playback-controls">
            {musicState.isPlaying ? (
              <button className="music-tab__control-btn" onClick={handlePause} title={t('music.pause')}>⏸</button>
            ) : (
              <button className="music-tab__control-btn" onClick={() => handleResume()} title={t('music.play')}>▶</button>
            )}
            <button className="music-tab__control-btn" onClick={handleStop} title={t('music.stop')}>⏹</button>
            <button
              className={`music-tab__control-btn ${loop ? 'music-tab__control-btn--active' : ''}`}
              onClick={() => setLoop(!loop)}
              title={t('music.loop')}
            >
              🔁
            </button>
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
        <div className="music-tab__section-header">
          <h4 className="music-tab__section-title">{t('music.title')} ({musicFiles.length})</h4>
          <button
            className="music-tab__add-btn"
            onClick={() => fileInputRef.current?.click()}
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
            className="music-tab__file-input"
          />
        </div>
        {musicFiles.length === 0 ? (
          <p className="music-tab__empty">{t('music.noFiles')}</p>
        ) : (
          <div className="music-tab__track-list">
            {musicFiles.map(file => (
              <div key={file.id} className={`music-tab__track-item ${isTrackPlaying(file) ? 'music-tab__track-item--playing' : ''}`}>
                <div className="music-tab__track-info">
                  <span className="music-tab__track-name">{file.name}</span>
                  <span className="music-tab__track-size">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                </div>
                <div className="music-tab__track-actions">
                  {isTrackPlaying(file) ? (
                    <button className="music-tab__track-btn" onClick={handlePause} title={t('music.pause')}>⏸</button>
                  ) : (
                    <button className="music-tab__track-btn" onClick={() => handlePlay(file)} title={t('music.play')}>▶</button>
                  )}
                  <div className="music-tab__add-to-playlist-wrapper">
                    <button
                      className="music-tab__track-btn"
                      onClick={() => setAddToPlaylistOpen(addToPlaylistOpen === file.id ? null : file.id)}
                      title={t('music.addToPlaylist')}
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
                  <button className="music-tab__track-btn music-tab__track-btn--delete" onClick={() => handleDelete(file)} title={t('common.delete')}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Playlists Section */}
      <section className="music-tab__section">
        <div className="music-tab__section-header">
          <h4 className="music-tab__section-title">{t('music.playlists')}</h4>
          <button
            className="music-tab__create-btn"
            onClick={() => setShowCreatePlaylist(!showCreatePlaylist)}
          >
            {showCreatePlaylist ? t('common.cancel') : t('music.createPlaylist')}
          </button>
        </div>

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
              {t('common.create')}
            </button>
          </div>
        )}

        {playlists.length === 0 && !showCreatePlaylist ? (
          <p className="music-tab__empty">{t('music.noPlaylists')}</p>
        ) : (
          <div className="music-tab__playlist-list">
            {playlists.map(playlist => {
              const tracks = getPlaylistTracks(playlist);
              const isActive = activePlaylist?.id === playlist.id;
              return (
                <div key={playlist.id} className={`music-tab__playlist-item ${isActive ? 'music-tab__playlist-item--active' : ''}`}>
                  <div className="music-tab__playlist-header">
                    <span className="music-tab__playlist-name">{playlist.name}</span>
                    <span className="music-tab__playlist-count">{tracks.length} {t('music.tracks')}</span>
                  </div>
                  <div className="music-tab__playlist-tracks">
                    {tracks.map((track, index) => (
                      <div key={`${playlist.id}-${track.id}-${index}`} className="music-tab__playlist-track">
                        <span className="music-tab__playlist-track-num">{index + 1}.</span>
                        <span className="music-tab__playlist-track-name">{track.name}</span>
                        <button
                          className="music-tab__track-btn music-tab__track-btn--small"
                          onClick={() => handleRemoveFromPlaylist(playlist.id, track.id)}
                          title={t('common.delete')}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="music-tab__playlist-actions">
                    <button
                      className="music-tab__playlist-play-btn"
                      onClick={() => handlePlayPlaylist(playlist)}
                      disabled={tracks.length === 0}
                    >
                      ▶ {t('music.play')}
                    </button>
                    <button
                      className="music-tab__track-btn music-tab__track-btn--delete"
                      onClick={() => handleDeletePlaylist(playlist)}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default MusicTab;
