import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiUrl } from '../api/axios';
import { getMusic, playTrack } from '../api/music';
import { WS_EVENTS } from '../websocket/events';

/**
 * Manages all music state: audio playback, GM volume, player volume,
 * and WS event handling for MUSIC_* events.
 */
export function useGameMusic(gameId) {
  const audioRef = useRef(new Audio());
  const [musicState, setMusicState] = useState({
    isPlaying: false,
    trackUrl: null,
    trackName: null,
    position: 0,
    gmVolume: 1.0,
  });
  const [playerVolume, setPlayerVolume] = useState(() => {
    const saved = localStorage.getItem('playerMusicVolume');
    return saved !== null ? parseFloat(saved) : 1.0;
  });

  const onPlayerVolumeChange = useCallback((vol) => {
    setPlayerVolume(vol);
    localStorage.setItem('playerMusicVolume', String(vol));
  }, []);

  // Sync audio volume when gmVolume or playerVolume changes
  useEffect(() => {
    audioRef.current.volume = musicState.gmVolume * playerVolume;
  }, [musicState.gmVolume, playerVolume]);

  // Cleanup audio on unmount
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio.pause();
      audio.src = '';
      audio.load();
    };
  }, []);

  const handleSceneAssignAll = useCallback(async (scene) => {
    if (!scene.sceneMusicId) return;
    try {
      const musicData = await getMusic();
      const resolveUrl = (url) => url?.startsWith('http') ? url : `${getApiUrl()}${url}`;
      if (scene.sceneMusicType === 'playlist') {
        const playlist = (musicData.playlists || []).find(p => p.id === scene.sceneMusicId);
        if (!playlist) return;
        const tracks = (playlist.tracks || [])
          .map(id => (musicData.music || []).find(f => f.id === id))
          .filter(Boolean);
        if (tracks.length === 0) return;
        await playTrack(gameId, resolveUrl(tracks[0].fileUrl), tracks[0].name, 0, scene.sceneMusicId, 0);
      } else {
        const file = (musicData.music || []).find(f => f.id === scene.sceneMusicId);
        if (!file) return;
        await playTrack(gameId, resolveUrl(file.fileUrl), file.name, 0);
      }
    } catch (err) {
      console.error('Failed to play scene music:', err);
    }
  }, [gameId]);

  // Handles MUSIC_* WS events. Returns true if the message was handled.
  const handleMusicMessage = useCallback((message) => {
    const audio = audioRef.current;
    switch (message.type) {
      case WS_EVENTS.MUSIC_PLAY: {
        const { trackUrl, trackName, position, playlistId, trackIndex } = message.payload;
        if (audio.src !== trackUrl) {
          audio.src = trackUrl;
        }
        audio.currentTime = position || 0;
        audio.play().catch((err) => {
          console.warn('Autoplay blocked:', err);
        });
        setMusicState(prev => ({
          ...prev,
          isPlaying: true,
          trackUrl,
          trackName: trackName || '',
          position: position || 0,
          playlistId: playlistId || null,
          trackIndex: trackIndex || 0,
        }));
        return true;
      }
      case WS_EVENTS.MUSIC_PAUSE: {
        audio.pause();
        setMusicState(prev => ({
          ...prev,
          isPlaying: false,
          position: message.payload.position || audio.currentTime,
        }));
        return true;
      }
      case WS_EVENTS.MUSIC_STOP: {
        audio.pause();
        audio.currentTime = 0;
        audio.src = '';
        setMusicState(prev => ({
          isPlaying: false,
          trackUrl: null,
          trackName: null,
          position: 0,
          gmVolume: prev.gmVolume,
        }));
        return true;
      }
      case WS_EVENTS.MUSIC_VOLUME: {
        setMusicState(prev => ({ ...prev, gmVolume: message.payload.volume }));
        return true;
      }
      default:
        return false;
    }
  }, []);

  return {
    audioRef,
    musicState,
    playerVolume,
    onPlayerVolumeChange,
    handleMusicMessage,
    handleSceneAssignAll,
  };
}
