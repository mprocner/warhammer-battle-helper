import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Button, Typography, Alert, CircularProgress } from '@mui/material';
import DragAndDropContext from './DndContext';
import RightPanel from './panels/RightPanel';
import PanelToggle from './panels/PanelToggle';
import useWebSocket from '../hooks/useWebSocket';
import { getApiUrl, getApiHeaders } from '../api/axios';

/**
 * GameSession component - manages a multiplayer game session with real-time sync
 */
const GameSession = ({ gameId, token, onLeaveGame, onLogout }) => {
  const [gameState, setGameState] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [characterUpdateTrigger, setCharacterUpdateTrigger] = useState(0);
  const [leftPanelHidden, setLeftPanelHidden] = useState(false);
  const [rightPanelHidden, setRightPanelHidden] = useState(false);
  const [gmViewingSceneId, setGmViewingSceneId] = useState(null);
  const [editingLayer, setEditingLayer] = useState('grid');

  // --- Music state ---
  const audioRef = useRef(new Audio());
  const [musicState, setMusicState] = useState({
    isPlaying: false,
    trackUrl: null,
    trackName: null,
    position: 0,
    gmVolume: 1.0
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
    };
  }, []);

  // Add log message - Define early so it can be used in callbacks
  const addLogMessage = useCallback((message, type = 'info', data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { message, type, timestamp, data }]);
  }, []);

  // Fetch initial game state via REST API
  const fetchGameState = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}`, {
        headers: getApiHeaders({
          'Authorization': `Bearer ${token}`
        })
      });

      if (!response.ok) throw new Error('Failed to fetch game state');

      const game = await response.json();
      setGameState(game);

      // Load historical events into logs (only on initial load)
      if (game.events && Array.isArray(game.events) && !historyLoaded) {
        const historicalLogs = game.events.map(event => {
          let message = '';
          const timestamp = new Date(event.createdAt).toLocaleTimeString();

          switch (event.type) {
            case 'join':
              message = `${event.username} joined the game`;
              return { message, type: 'success', timestamp };
            case 'leave':
              message = `${event.username} left the game`;
              return { message, type: 'info', timestamp };
            case 'character_add':
              message = `${event.username} added character to battlefield`;
              return { message, type: 'success', timestamp };
            case 'move':
              // Don't show movement events in chat
              return null;
            case 'dice_roll':
              // Check if it's a skill roll (has skillKey)
              if (event.data.skillKey && event.data.characterId) {
                return {
                  message: null,
                  type: 'skill_roll',
                  timestamp,
                  data: {
                    rollType: 'skill',
                    ...event.data
                  }
                };
              }
              // Check if it's an attribute roll
              else if (event.data.attribute && event.data.characterId) {
                return {
                  message: null,
                  type: 'dice_roll',
                  timestamp,
                  data: {
                    rollType: 'attribute',
                    ...event.data
                  }
                };
              }
              // Simple dice roll
              else {
                return {
                  message: null,
                  type: 'dice_roll',
                  timestamp,
                  data: {
                    rollType: 'simple',
                    result: event.data.result,
                    sides: event.data.sides
                  }
                };
              }
            case 'skill_roll':
              return {
                message: null,
                type: 'skill_roll',
                timestamp,
                data: {
                  rollType: 'skill',
                  ...event.data
                }
              };
            case 'attack':
              // Check if we have structured fight data
              if (event.data.result) {
                return {
                  message: null,
                  type: 'fight',
                  timestamp,
                  data: {
                    rollType: 'fight',
                    ...event.data
                  }
                };
              }
              // Fallback for old format
              if (event.data.messages && Array.isArray(event.data.messages)) {
                return event.data.messages.map(msg => ({
                  message: msg,
                  type: 'info',
                  timestamp
                }));
              }
              return { message: `${event.username} initiated combat`, type: 'warning', timestamp };
            case 'message':
              message = event.data.message || '';
              return { message, type: event.data.type || 'info', timestamp, data: { username: event.username } };
            default:
              return null;
          }
        }).flat().filter(log => log !== null);

        setLogs(historicalLogs);
        setHistoryLoaded(true);
      }

      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch game state:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [gameId, token, historyLoaded]);

  // Handle incoming WebSocket messages
  const handleWebSocketMessage = useCallback((message) => {
    console.log('GameSession: Received WebSocket message', message);
    console.log('GameSession: handleWebSocketMessage function ID:', handleWebSocketMessage);

    switch (message.type) {
      case 'GAME_STATE':
        // Full game state received
        setGameState(message.payload.game);
        addLogMessage('Game state synchronized', 'info');
        setLoading(false);
        break;

      case 'PARTICIPANT_JOINED':
        addLogMessage(
          `${message.payload.username} joined the game`,
          'success'
        );
        // Fetch updated game state
        fetchGameState();
        break;

      case 'PARTICIPANT_LEFT':
        addLogMessage(
          `A player left the game`,
          'info'
        );
        fetchGameState();
        break;

      case 'CHARACTER_ADDED':
        addLogMessage(
          `Character added to the battlefield`,
          'success'
        );
        fetchGameState();
        setCharacterUpdateTrigger(prev => prev + 1);
        break;

      case 'CHARACTER_MOVED':
        // Just update the game state without logging to chat
        fetchGameState();
        setCharacterUpdateTrigger(prev => prev + 1);
        break;

      case 'CHARACTER_REMOVED':
        addLogMessage('Character removed from battlefield', 'info');
        fetchGameState();
        setCharacterUpdateTrigger(prev => prev + 1);
        break;

      case 'LOG_MESSAGE':
        addLogMessage(
          message.payload.message,
          message.payload.type || 'info',
          { username: message.payload.username }
        );
        break;

      case 'DICE_ROLLED':
        // Pass structured data to log
        addLogMessage(null, 'dice_roll', {
          rollType: message.payload.attribute ? 'attribute' : 'simple',
          ...message.payload
        });
        break;

      case 'SKILL_ROLLED':
        // Pass structured data to log
        addLogMessage(null, 'skill_roll', {
          rollType: 'skill',
          ...message.payload
        });
        break;

      case 'WEAPON_ROLLED':
        // Pass structured data to log
        addLogMessage(null, 'weapon_roll', {
          rollType: 'weapon',
          ...message.payload
        });
        break;

      case 'FIGHT_RESULT':
        // Pass structured fight data to log
        console.log('FIGHT_RESULT received:', message.payload);
        console.log('FIGHT_RESULT result:', message.payload.result);
        addLogMessage(null, 'fight', {
          rollType: 'fight',
          ...message.payload
        });
        break;

      case 'HANDOUT_CREATED':
      case 'HANDOUT_UPDATED':
      case 'HANDOUT_DELETED':
      case 'HANDOUTS_REORDERED':
        // Handout updates are handled by the HandoutsTab component
        // We just trigger a refresh of the game state
        fetchGameState();
        break;

      // Scene-related messages
      case 'SCENE_CREATED':
      case 'SCENE_UPDATED':
      case 'SCENE_DELETED':
      case 'PLAYER_SCENE_CHANGED':
        fetchGameState();
        break;

      case 'SCENE_CHARACTER_ADDED':
      case 'SCENE_CHARACTER_MOVED':
      case 'SCENE_CHARACTER_REMOVED':
        fetchGameState();
        setCharacterUpdateTrigger(prev => prev + 1);
        break;

      case 'SCENE_IMAGE_ADDED':
      case 'SCENE_IMAGE_UPDATED':
      case 'SCENE_IMAGE_DELETED':
        fetchGameState();
        break;

      // Music-related messages
      case 'MUSIC_PLAY': {
        const audio = audioRef.current;
        const { trackUrl, trackName, position } = message.payload;
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
          position: position || 0
        }));
        break;
      }

      case 'MUSIC_PAUSE': {
        const audio = audioRef.current;
        audio.pause();
        setMusicState(prev => ({
          ...prev,
          isPlaying: false,
          position: message.payload.position || audio.currentTime
        }));
        break;
      }

      case 'MUSIC_STOP': {
        const audio = audioRef.current;
        audio.pause();
        audio.currentTime = 0;
        audio.src = '';
        setMusicState({
          isPlaying: false,
          trackUrl: null,
          trackName: null,
          position: 0,
          gmVolume: musicState.gmVolume
        });
        break;
      }

      case 'MUSIC_VOLUME': {
        const { volume } = message.payload;
        setMusicState(prev => ({ ...prev, gmVolume: volume }));
        break;
      }

      default:
        console.warn('Unknown message type:', message.type);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchGameState, addLogMessage]);

  // WebSocket connection
  const { isConnected, error: wsError } = useWebSocket(
    gameId,
    token,
    handleWebSocketMessage
  );

  useEffect(() => {
    fetchGameState();
  }, [fetchGameState]);

  // Handle leaving the game
  const handleLeaveGame = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}/leave`, {
        method: 'POST',
        headers: getApiHeaders({
          'Authorization': `Bearer ${token}`
        })
      });

      if (!response.ok) throw new Error('Failed to leave game');

      onLeaveGame();
    } catch (err) {
      setError(err.message);
    }
  };

  // Compute isGM and displayScene
  const getUserId = useCallback(() => {
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.user_id;
    } catch {
      return null;
    }
  }, [token]);

  const userId = getUserId();
  const isGM = gameState?.gameMasterId === userId;

  const displayScene = useMemo(() => {
    const scenes = gameState?.scenes || [];
    if (scenes.length === 0) return null;

    if (isGM) {
      // GM: use selected scene, fallback to first
      if (gmViewingSceneId) {
        const found = scenes.find(s => s.id === gmViewingSceneId);
        if (found) return found;
      }
      return scenes[0];
    } else {
      // Player: use assigned scene
      const assignedScene = scenes.find(s =>
        (s.assignedPlayers || []).includes(userId)
      );
      return assignedScene || scenes.find(s => s.isDefault) || scenes[0];
    }
  }, [gameState?.scenes, isGM, gmViewingSceneId, userId]);

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 2
      }}>
        <CircularProgress size={60} thickness={4} />
        <Typography
          variant="h5"
          sx={{
            fontFamily: 'Cinzel, serif',
            color: 'text.primary'
          }}
        >
          Loading game session...
        </Typography>
      </Box>
    );
  }

  if (error && !gameState) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button variant="contained" onClick={onLeaveGame}>
          Back to Lobby
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {wsError && (
        <Alert severity="warning" sx={{ m: 2 }}>
          WebSocket error: {wsError}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ m: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Main Game Area */}
      <Box sx={{
        flexGrow: 1,
        display: 'flex',
        overflow: 'hidden',
        position: 'relative'
      }}>
        {/* Right Panel Toggle */}
        <PanelToggle
          position="right"
          isHidden={rightPanelHidden}
          onClick={() => setRightPanelHidden(!rightPanelHidden)}
        />

        {/* Battle Grid */}
        <Box sx={{
          flexGrow: 1,
          overflow: 'auto'
        }}>
          <DragAndDropContext
            addLogMessage={addLogMessage}
            gameId={gameId}
            token={token}
            characterUpdateTrigger={characterUpdateTrigger}
            isHidden={leftPanelHidden}
            onTogglePanel={() => setLeftPanelHidden(!leftPanelHidden)}
            currentScene={displayScene}
            isGM={isGM}
            editingLayer={editingLayer}
          />
        </Box>

        {/* Right Panel */}
        <RightPanel
          isHidden={rightPanelHidden}
          logs={logs}
          addLogMessage={addLogMessage}
          gameId={gameId}
          token={token}
          onLogout={onLogout}
          onLeaveGame={handleLeaveGame}
          gameState={gameState}
          isConnected={isConnected}
          currentSceneId={displayScene?.id}
          onSceneChange={setGmViewingSceneId}
          editingLayer={editingLayer}
          onEditingLayerChange={setEditingLayer}
          musicState={musicState}
          audioRef={audioRef}
          playerVolume={playerVolume}
          onPlayerVolumeChange={onPlayerVolumeChange}
        />
      </Box>
    </Box>
  );
};

export default GameSession;
