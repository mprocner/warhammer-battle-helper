import { useState, useEffect, useCallback, useRef } from 'react';
import { getMusic, playTrack, nextTrack, setVolume } from '../api/music';
import { resolveFileUrl } from '../utils/fileUrl';

import { WS_EVENTS } from '../websocket/events';

// The GM slider is a controlled input fed by server state, so every change used to cost
// a POST + Mongo write + broadcast. With a 1% step that is ~100 round-trips per drag, so
// the value is applied locally at once and committed once the GM stops moving the knob.
const VOLUME_COMMIT_DELAY_MS = 300;

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
    playlistId: null,
    trackIndex: 0,
    loop: false,
    version: 0,
  });
  const [playerVolume, setPlayerVolume] = useState(() => {
    const saved = localStorage.getItem('playerMusicVolume');
    return saved !== null ? parseFloat(saved) : 1.0;
  });

  // Keep a ref so the 'ended' handler always sees the latest version without re-adding the listener
  const musicStateRef = useRef(musicState);
  useEffect(() => {
    musicStateRef.current = musicState;
  }, [musicState]);

  const volumeTimerRef = useRef(null);
  const pendingVolumeRef = useRef(null);

  const onPlayerVolumeChange = useCallback((vol) => {
    setPlayerVolume(vol);
    localStorage.setItem('playerMusicVolume', String(vol));
  }, []);

  const commitGmVolume = useCallback((vol) => {
    setVolume(gameId, vol).catch(err => console.error('Failed to set volume:', err));
  }, [gameId]);

  const onGmVolumeChange = useCallback((vol) => {
    // Optimistic: this also drives audioRef.current.volume through the effect below,
    // so the GM hears his own change without waiting for the WS echo.
    setMusicState(prev => ({ ...prev, gmVolume: vol }));
    pendingVolumeRef.current = vol;
    if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
    volumeTimerRef.current = setTimeout(() => {
      volumeTimerRef.current = null;
      pendingVolumeRef.current = null;
      commitGmVolume(vol);
    }, VOLUME_COMMIT_DELAY_MS);
  }, [commitGmVolume]);

  // Flush rather than drop: leaving the game within 300ms of a change would otherwise
  // lose it silently.
  useEffect(() => () => {
    if (volumeTimerRef.current) {
      clearTimeout(volumeTimerRef.current);
      // Null both refs before committing: this cleanup can run again (e.g. gameId
      // changes and the effect re-subscribes) without a real user action in between.
      // Leaving stale values behind would let a later, unrelated re-run see a truthy
      // timer ref and re-fire the commit against the NEW gameId with the OLD volume —
      // a cross-game write.
      volumeTimerRef.current = null;
      const pending = pendingVolumeRef.current;
      pendingVolumeRef.current = null;
      commitGmVolume(pending);
    }
  }, [commitGmVolume]);

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

  // 'ended' handler — any participant detects track end and calls the backend.
  // Backend uses optimistic lock (version) so only the first caller advances.
  useEffect(() => {
    const audio = audioRef.current;
    const handleEnded = () => {
      const { version, isPlaying } = musicStateRef.current;
      if (!isPlaying) return;
      nextTrack(gameId, version).catch(err => console.error('[music] nextTrack failed:', err));
    };
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [gameId]);

  // Sync music state from a game object (called by GameSession after fetchGameState).
  // Only starts/adjusts playback if the track URL changed, so ongoing playback isn't disrupted.
  const syncFromGame = useCallback((gameMusicState) => {
    if (!gameMusicState) return;
    const audio = audioRef.current;

    setMusicState(prev => ({
      isPlaying: !!gameMusicState.isPlaying,
      trackUrl: gameMusicState.trackUrl || null,
      trackName: gameMusicState.trackName || null,
      position: gameMusicState.position || 0,
      // A commit is still pending, so the server copy is older than what the GM is
      // dragging right now — keep the local value rather than yanking the knob back.
      gmVolume: volumeTimerRef.current ? prev.gmVolume : (gameMusicState.volume || 1.0),
      playlistId: gameMusicState.playlistId || null,
      trackIndex: gameMusicState.trackIndex || 0,
      loop: !!gameMusicState.loop,
      version: gameMusicState.version || 0,
    }));

    if (gameMusicState.isPlaying && gameMusicState.trackUrl) {
      const url = resolveFileUrl(gameMusicState.trackUrl);
      if (audio.src !== url) {
        audio.src = url;
        audio.currentTime = gameMusicState.position || 0;
        audio.play().catch(err => console.warn('[music] Autoplay blocked:', err));
      }
      // Same track already playing — don't seek to avoid disruption
    } else if (!gameMusicState.isPlaying) {
      if (audio.paused) return; // already stopped
      audio.pause();
      if (!gameMusicState.trackUrl) {
        audio.src = '';
      }
    }
  }, []);

  const handleSceneAssignAll = useCallback(async (scene) => {
    if (!scene.sceneMusicId) return;
    try {
      const musicData = await getMusic();
      if (scene.sceneMusicType === 'playlist') {
        const playlist = (musicData.playlists || []).find(p => p.id === scene.sceneMusicId);
        if (!playlist) return;
        const tracks = (playlist.tracks || [])
          .map(id => (musicData.music || []).find(f => f.id === id))
          .filter(Boolean);
        if (tracks.length === 0) return;
        await playTrack(gameId, resolveFileUrl(tracks[0].fileUrl), tracks[0].name, 0, scene.sceneMusicId, 0, scene.sceneMusicLoop !== false, tracks[0].id);
      } else {
        const file = (musicData.music || []).find(f => f.id === scene.sceneMusicId);
        if (!file) return;
        await playTrack(gameId, resolveFileUrl(file.fileUrl), file.name, 0, '', 0, scene.sceneMusicLoop !== false, file.id);
      }
    } catch (err) {
      console.error('[music] Failed to play scene music:', err);
    }
  }, [gameId]);

  // Handles MUSIC_* WS events. Returns true if the message was handled.
  const handleMusicMessage = useCallback((message) => {
    const audio = audioRef.current;
    switch (message.type) {
      case WS_EVENTS.MUSIC_PLAY: {
        const { trackUrl: rawTrackUrl, trackName, position, playlistId, trackIndex, loop, version } = message.payload;
        // trackUrl from WS may already be absolute (MusicTab resolves before POSTing) —
        // resolveFileUrl is idempotent for that case.
        const trackUrl = resolveFileUrl(rawTrackUrl);
        if (audio.src !== trackUrl) {
          audio.src = trackUrl;
        }
        audio.currentTime = position || 0;
        audio.play().catch((err) => {
          console.warn('[music] Autoplay blocked:', err);
        });
        setMusicState(prev => ({
          ...prev,
          isPlaying: true,
          trackUrl,
          trackName: trackName || '',
          position: position || 0,
          playlistId: playlistId || null,
          trackIndex: trackIndex || 0,
          loop: loop != null ? loop : prev.loop,
          version: version != null ? version : prev.version,
        }));
        return true;
      }
      case WS_EVENTS.MUSIC_PAUSE: {
        audio.pause();
        setMusicState(prev => ({
          ...prev,
          isPlaying: false,
          position: message.payload.position != null ? message.payload.position : audio.currentTime,
          version: message.payload.version != null ? message.payload.version : prev.version,
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
          playlistId: null,
          trackIndex: 0,
          loop: prev.loop,
          version: message.payload?.version != null ? message.payload.version : prev.version,
        }));
        return true;
      }
      case WS_EVENTS.MUSIC_VOLUME: {
        setMusicState(prev => ({ ...prev, gmVolume: message.payload.volume }));
        return true;
      }
      case WS_EVENTS.MUSIC_LOOP: {
        setMusicState(prev => ({
          ...prev,
          loop: message.payload.loop,
          version: message.payload.version != null ? message.payload.version : prev.version,
        }));
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
    onGmVolumeChange,
    handleMusicMessage,
    handleSceneAssignAll,
    syncFromGame,
  };
}
