import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Button, Typography, Alert, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import ConfirmModal from './common/ConfirmModal';
import DragAndDropContext from './DndContext';
import RightPanel from './panels/RightPanel';
import PanelToggle from './panels/PanelToggle';
import useWebSocket from '../hooks/useWebSocket';
import { useOnlineUsers } from '../hooks/useOnlineUsers';
import { useControlScheme } from '../hooks/useControlScheme';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useGameMusic } from '../hooks/useGameMusic';
import { useDrawingTools } from '../hooks/useDrawingTools';
import { useFogTools } from '../hooks/useFogTools';
import { getApiUrl, getApiHeaders } from '../api/axios';
import { addFogPath, addDrawingPath, deleteDrawingPath } from '../api/scenes';
import { getMinigameState } from '../api/minigame';
import SceneSelector from './scene/SceneSelector';
import WindowBar from './WindowBar';
import { WindowManagerProvider } from '../contexts/WindowManagerContext';
import YahtzeeBoardModal from './minigame/YahtzeeBoardModal';
import DicePokerBoardModal from './minigame/DicePokerBoardModal';
import { WS_EVENTS } from '../websocket/events';
import ToastStack from './ToastStack';
import { useToastQueue } from '../hooks/useToastQueue';

const TOAST_ROLL_EVENTS = new Set([WS_EVENTS.DICE_ROLLED, WS_EVENTS.SKILL_ROLLED, WS_EVENTS.WEAPON_ROLLED]);

/**
 * GameSession component - manages a multiplayer game session with real-time sync
 */
const GameSession = ({ gameId, token, onGoToGameList, onLogout }) => {
  const { t } = useTranslation();
  const [gameState, setGameState] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [characterUpdateTrigger, setCharacterUpdateTrigger] = useState(0);
  const [characterDataTrigger, setCharacterDataTrigger] = useState(0);
  const [leftPanelHidden, setLeftPanelHidden] = useState(false);
  const [rightPanelHidden, setRightPanelHidden] = useState(false);
  // Wspólne zwijanie górnych listew (okna + sceny) jednym przyciskiem
  const [topBarsCollapsed, setTopBarsCollapsed] = useState(false);
  const [gmViewingSceneId, setGmViewingSceneId] = useState(null);
  const [pointerPings, setPointerPings] = useState([]);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [rollVisibility, setRollVisibility] = useState('all');
  const [controlScheme, setControlScheme] = useControlScheme();
  const [minigameState, setMinigameState] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');

  const { toasts, pushToast, dismissToast, pauseAll, resumeAll } = useToastQueue();
  const isGMRef = useRef(false);

  const { userId } = useCurrentUser(token);
  const { onlineUserIds, handleOnlineUsersMessage } = useOnlineUsers();
  const { audioRef, musicState, playerVolume, onPlayerVolumeChange, handleMusicMessage, handleSceneAssignAll, syncFromGame } = useGameMusic(gameId);
  const { activeTool, setActiveTool, brushSize, setBrushSize, drawingColor, setDrawingColor, drawingFontSize, setDrawingFontSize } = useDrawingTools();
  const { editingLayer, setEditingLayer, fogCoverMode, setFogCoverMode } = useFogTools();

  // Block browser back button and tab close while in game
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      setShowBackConfirm(true);
    };

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const addLogMessage = useCallback((message, type = 'info', data = null) => {
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    setLogs((prev) => [...prev, { id: crypto.randomUUID(), createdAt: now.getTime(), message, type, timestamp, data }]);
  }, []);

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

      // Sync music playback state from the server (handles re-entry, initial load)
      if (game.music) {
        syncFromGame(game.music);
      }

      // Rehydrate minigame state on reconnect
      getMinigameState(game.id || gameId).then(mg => {
        if (mg) setMinigameState(mg);
      });

      if (game.events && Array.isArray(game.events) && !historyLoaded) {
        const historicalLogs = game.events.map(event => {
          let message = '';
          const createdAt = new Date(event.createdAt).getTime();
          const timestamp = new Date(event.createdAt).toLocaleTimeString();

          switch (event.type) {
            case 'join':
              message = `${event.username} joined the game`;
              return { createdAt, message, type: 'success', timestamp };
            case 'leave':
              message = `${event.username} left the game`;
              return { createdAt, message, type: 'info', timestamp };
            case 'character_add':
              message = `${event.username} added character to battlefield`;
              return { createdAt, message, type: 'success', timestamp };
            case 'move':
              return null;
            case 'dice_roll':
              return {
                createdAt,
                message: null,
                type: 'dice_roll',
                timestamp,
                data: { ...event.data }
              };
            case 'message':
              message = event.data.message || '';
              return { createdAt, message, type: event.data.type || 'info', timestamp, data: { username: event.username, userId: event.createdBy } };
            default:
              return null;
          }
        }).flat().filter(log => log !== null).map(log => ({ id: crypto.randomUUID(), ...log }));

        setLogs(historicalLogs);
        setHistoryLoaded(true);
      }

      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch game state:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [gameId, token, historyLoaded, syncFromGame]);

  const removePing = useCallback((pingId) => {
    setPointerPings(prev => prev.filter(p => p.id !== pingId));
  }, []);

  const handleWebSocketMessage = useCallback((message) => {
    // Delegate music events to the dedicated hook
    if (handleMusicMessage(message)) return;

    // Push roll notifications — skip gm_only rolls for non-GM users
    if (TOAST_ROLL_EVENTS.has(message.type)) {
      const vis = message.payload?.visibility;
      if (!vis || vis === 'all' || isGMRef.current) {
        pushToast(message.payload);
      }
    }

    switch (message.type) {
      case WS_EVENTS.GAME_STATE:
        setGameState(message.payload.game);
        addLogMessage('Game state synchronized', 'info');
        setLoading(false);
        break;

      case WS_EVENTS.GAME_DELETED:
        onGoToGameList();
        break;

      case WS_EVENTS.PARTICIPANT_JOINED: {
        const newParticipant = message.payload.participant;
        addLogMessage(`${newParticipant.username} joined the game`, 'success');
        setGameState(prev => {
          if (!prev) return prev;
          const already = (prev.participants || []).some(p => p.userId === newParticipant.userId);
          if (already) return prev;
          return { ...prev, participants: [...(prev.participants || []), newParticipant] };
        });
        break;
      }

      case WS_EVENTS.PARTICIPANT_LEFT:
        addLogMessage(`A player left the game`, 'info');
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, participants: (prev.participants || []).filter(p => p.userId !== message.payload.userId) };
        });
        break;

      case WS_EVENTS.PARTICIPANT_UPDATED: {
        const { userId: updUserId, avatar, avatarType, avatarCharacterId, signature, avatarSize, showSignature } = message.payload;
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            participants: (prev.participants || []).map(p =>
              p.userId === updUserId
                ? { ...p, avatar, avatarType, avatarCharacterId, signature, avatarSize, showSignature }
                : p
            ),
          };
        });
        break;
      }

      case WS_EVENTS.CHARACTER_ADDED:
        addLogMessage(`Character added to the battlefield`, 'success');
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, characters: [...(prev.characters || []), message.payload.character] };
        });
        setCharacterUpdateTrigger(prev => prev + 1);
        break;

      case WS_EVENTS.CHARACTER_MOVED: {
        const { characterId, x, y } = message.payload;
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            characters: (prev.characters || []).map(c =>
              c.id === characterId ? { ...c, x, y } : c
            ),
          };
        });
        setCharacterUpdateTrigger(prev => prev + 1);
        break;
      }

      case WS_EVENTS.CHARACTER_REMOVED:
        addLogMessage('Character removed from battlefield', 'info');
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, characters: (prev.characters || []).filter(c => c.id !== message.payload.characterId) };
        });
        setCharacterUpdateTrigger(prev => prev + 1);
        break;

      case WS_EVENTS.CHARACTER_UPDATED: {
        const updatedChar = message.payload.character;
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            characters: (prev.characters || []).map(c =>
              c.id === updatedChar.id ? updatedChar : c
            ),
          };
        });
        setCharacterDataTrigger(prev => prev + 1);
        break;
      }

      case WS_EVENTS.CHARACTER_VISIBILITY_UPDATED: {
        const { characterId: visCharId, visibleTo } = message.payload;
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            characters: (prev.characters || []).map(c =>
              c.id === visCharId ? { ...c, visibleTo } : c
            ),
          };
        });
        setCharacterDataTrigger(prev => prev + 1);
        break;
      }

      case WS_EVENTS.LOG_MESSAGE:
        addLogMessage(
          message.payload.message,
          message.payload.type || 'info',
          { username: message.payload.username, userId: message.payload.userId }
        );
        break;

      case WS_EVENTS.DICE_ROLLED:
      case WS_EVENTS.SKILL_ROLLED:
      case WS_EVENTS.WEAPON_ROLLED:
        addLogMessage(null, 'roll', { ...message.payload });
        break;

      case WS_EVENTS.HANDOUT_CREATED:
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, handouts: [...(prev.handouts || []), message.payload.handout] };
        });
        break;

      case WS_EVENTS.HANDOUT_UPDATED:
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, handouts: (prev.handouts || []).map(h => h.id === message.payload.handout.id ? message.payload.handout : h) };
        });
        break;

      case WS_EVENTS.HANDOUT_DELETED:
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, handouts: (prev.handouts || []).filter(h => h.id !== message.payload.handoutId) };
        });
        break;

      case WS_EVENTS.HANDOUTS_REORDERED:
        setGameState(prev => prev ? { ...prev, handouts: message.payload.handouts } : prev);
        break;

      case WS_EVENTS.HANDOUT_MOVED:
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            handouts: (prev.handouts || []).map(h =>
              h.id === message.payload.handoutId ? { ...h, folderId: message.payload.folderId } : h
            ),
          };
        });
        break;

      case WS_EVENTS.HANDOUT_FOLDER_CREATED:
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, handoutFolders: [...(prev.handoutFolders || []), message.payload.folder] };
        });
        break;

      case WS_EVENTS.HANDOUT_FOLDER_UPDATED:
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            handoutFolders: (prev.handoutFolders || []).map(f =>
              f.id === message.payload.folderId ? { ...f, name: message.payload.name } : f
            ),
          };
        });
        break;

      case WS_EVENTS.HANDOUT_FOLDER_DELETED:
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            handouts: message.payload.handouts,
            handoutFolders: message.payload.folders,
          };
        });
        break;

      case WS_EVENTS.HANDOUT_FOLDERS_REORDERED:
        setGameState(prev => prev ? { ...prev, handoutFolders: message.payload.folders } : prev);
        break;

      case WS_EVENTS.NOTE_CREATED:
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, notes: [...(prev.notes || []), message.payload.note] };
        });
        break;

      case WS_EVENTS.NOTE_UPDATED:
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, notes: (prev.notes || []).map(n => n.id === message.payload.note.id ? message.payload.note : n) };
        });
        break;

      case WS_EVENTS.NOTE_DELETED:
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, notes: (prev.notes || []).filter(n => n.id !== message.payload.noteId) };
        });
        break;

      case WS_EVENTS.SCENE_CREATED:
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, scenes: [...(prev.scenes || []), message.payload.scene] };
        });
        break;

      case WS_EVENTS.SCENE_UPDATED:
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, scenes: (prev.scenes || []).map(s => s.id === message.payload.scene.id ? message.payload.scene : s) };
        });
        break;

      case WS_EVENTS.SCENE_DELETED:
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, scenes: (prev.scenes || []).filter(s => s.id !== message.payload.sceneId) };
        });
        break;

      case WS_EVENTS.PLAYER_SCENE_CHANGED: {
        const { playerId, sceneId: assignedSceneId, assigned } = message.payload;
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            scenes: (prev.scenes || []).map(s => {
              if (s.id === assignedSceneId) {
                const players = s.assignedPlayers || [];
                return {
                  ...s,
                  assignedPlayers: assigned
                    ? [...players.filter(id => id !== playerId), playerId]
                    : players.filter(id => id !== playerId),
                };
              }
              if (assigned) {
                return { ...s, assignedPlayers: (s.assignedPlayers || []).filter(id => id !== playerId) };
              }
              return s;
            }),
          };
        });
        break;
      }

      case WS_EVENTS.SCENE_CHARACTER_ADDED:
        setGameState(prev => {
          if (!prev) return prev;
          const { sceneId, character } = message.payload;
          return {
            ...prev,
            scenes: (prev.scenes || []).map(s =>
              s.id === sceneId
                ? { ...s, characters: [...(s.characters || []), character] }
                : s
            ),
          };
        });
        setCharacterUpdateTrigger(prev => prev + 1);
        break;

      case WS_EVENTS.SCENE_CHARACTER_MOVED: {
        const { sceneId: scId, characterId: scCharId, x: scX, y: scY } = message.payload;
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            scenes: (prev.scenes || []).map(s =>
              s.id === scId
                ? {
                    ...s,
                    characters: (s.characters || []).map(c =>
                      c.id === scCharId ? { ...c, x: scX, y: scY } : c
                    ),
                  }
                : s
            ),
          };
        });
        setCharacterUpdateTrigger(prev => prev + 1);
        break;
      }

      case WS_EVENTS.SCENE_CHARACTER_REMOVED:
        setGameState(prev => {
          if (!prev) return prev;
          const { sceneId: scRId, characterId: scRCharId } = message.payload;
          return {
            ...prev,
            scenes: (prev.scenes || []).map(s =>
              s.id === scRId
                ? { ...s, characters: (s.characters || []).filter(c => c.id !== scRCharId) }
                : s
            ),
          };
        });
        setCharacterUpdateTrigger(prev => prev + 1);
        break;

      case WS_EVENTS.SCENE_IMAGE_ADDED:
        setGameState(prev => {
          if (!prev) return prev;
          const { sceneId: siSceneId, image } = message.payload;
          return {
            ...prev,
            scenes: (prev.scenes || []).map(s =>
              s.id === siSceneId
                ? { ...s, images: [...(s.images || []), image] }
                : s
            ),
          };
        });
        break;

      case WS_EVENTS.SCENE_IMAGE_UPDATED:
        setGameState(prev => {
          if (!prev) return prev;
          const { sceneId: siuSceneId, imageId, update } = message.payload;
          return {
            ...prev,
            scenes: (prev.scenes || []).map(s =>
              s.id === siuSceneId
                ? {
                    ...s,
                    images: (s.images || []).map(img =>
                      img.id === imageId ? { ...img, ...update } : img
                    ),
                  }
                : s
            ),
          };
        });
        break;

      case WS_EVENTS.SCENE_IMAGE_DELETED:
        setGameState(prev => {
          if (!prev) return prev;
          const { sceneId: sidSceneId, imageId: delImageId } = message.payload;
          return {
            ...prev,
            scenes: (prev.scenes || []).map(s =>
              s.id === sidSceneId
                ? { ...s, images: (s.images || []).filter(img => img.id !== delImageId) }
                : s
            ),
          };
        });
        break;

      case WS_EVENTS.FOG_TOGGLED:
        setGameState(prev => {
          if (!prev) return prev;
          const { sceneId, fogEnabled, fogOpacity } = message.payload;
          return {
            ...prev,
            scenes: prev.scenes.map(s =>
              s.id === sceneId ? { ...s, fogEnabled, fogOpacity } : s
            ),
          };
        });
        break;

      case WS_EVENTS.FOG_PATH_ADDED:
        setGameState(prev => {
          if (!prev) return prev;
          const { sceneId, path } = message.payload;
          return {
            ...prev,
            scenes: prev.scenes.map(s =>
              s.id === sceneId
                ? { ...s, revealPaths: [...(s.revealPaths || []), path] }
                : s
            ),
          };
        });
        break;

      case WS_EVENTS.FOG_PATH_REMOVED:
        setGameState(prev => {
          if (!prev) return prev;
          const { sceneId } = message.payload;
          return {
            ...prev,
            scenes: prev.scenes.map(s =>
              s.id === sceneId
                ? { ...s, revealPaths: (s.revealPaths || []).slice(0, -1) }
                : s
            ),
          };
        });
        break;

      case WS_EVENTS.FOG_CLEARED:
        setGameState(prev => {
          if (!prev) return prev;
          const { sceneId } = message.payload;
          return {
            ...prev,
            scenes: prev.scenes.map(s =>
              s.id === sceneId ? { ...s, revealPaths: [] } : s
            ),
          };
        });
        break;

      case WS_EVENTS.FOG_REVEALED_ALL:
        setGameState(prev => {
          if (!prev) return prev;
          const { sceneId, path } = message.payload;
          return {
            ...prev,
            scenes: prev.scenes.map(s =>
              s.id === sceneId ? { ...s, revealPaths: [path] } : s
            ),
          };
        });
        break;

      case WS_EVENTS.DRAWING_PATH_ADDED:
        setGameState(prev => {
          if (!prev) return prev;
          const { sceneId, path } = message.payload;
          return {
            ...prev,
            scenes: prev.scenes.map(s =>
              s.id === sceneId
                ? { ...s, drawingPaths: [...(s.drawingPaths || []), path] }
                : s
            ),
          };
        });
        break;

      case WS_EVENTS.DRAWING_PATH_REMOVED:
        setGameState(prev => {
          if (!prev) return prev;
          const { sceneId, pathId } = message.payload;
          return {
            ...prev,
            scenes: prev.scenes.map(s =>
              s.id === sceneId
                ? { ...s, drawingPaths: (s.drawingPaths || []).filter(p => p.id !== pathId) }
                : s
            ),
          };
        });
        break;

      case WS_EVENTS.DRAWING_CLEARED:
        setGameState(prev => {
          if (!prev) return prev;
          const { sceneId } = message.payload;
          return {
            ...prev,
            scenes: prev.scenes.map(s =>
              s.id === sceneId ? { ...s, drawingPaths: [] } : s
            ),
          };
        });
        break;

      case WS_EVENTS.POINTER_PING: {
        const { x, y, sceneId } = message.payload;
        const ping = { id: `${Date.now()}-${Math.random()}`, x, y, sceneId };
        setPointerPings(prev => [...prev, ping]);
        break;
      }

      case WS_EVENTS.USERS_ONLINE:
        handleOnlineUsersMessage(message);
        break;

      case WS_EVENTS.MINIGAME_STARTED:
      case WS_EVENTS.MINIGAME_STATE_UPDATED:
        setMinigameState(message.payload.game);
        break;

      case WS_EVENTS.MINIGAME_ENDED:
        setMinigameState({ ended: true, gameType: message.payload.gameType, players: message.payload.players });
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchGameState, addLogMessage, handleOnlineUsersMessage, handleMusicMessage, onGoToGameList, pushToast]);

  const { isConnected, error: wsError, sendMessage } = useWebSocket(
    gameId,
    token,
    handleWebSocketMessage
  );

  useEffect(() => {
    fetchGameState();
  }, [fetchGameState]);

  const isGM = gameState?.gameMasterId === userId;
  isGMRef.current = isGM;

  const displayScene = useMemo(() => {
    const scenes = gameState?.scenes || [];
    if (scenes.length === 0) return null;

    if (isGM) {
      if (gmViewingSceneId) {
        const found = scenes.find(s => s.id === gmViewingSceneId);
        if (found) return found;
      }
      return scenes[0];
    } else {
      const assignedScene = scenes.find(s =>
        (s.assignedPlayers || []).includes(userId)
      );
      return assignedScene || scenes.find(s => s.isDefault) || scenes[0];
    }
  }, [gameState?.scenes, isGM, gmViewingSceneId, userId]);

  const handleFogPathComplete = useCallback(async (path) => {
    if (!displayScene) return;
    try {
      await addFogPath(gameId, displayScene.id, path);
    } catch (err) {
      console.error('Failed to save fog path:', err);
    }
  }, [gameId, displayScene]);

  const handleDrawingPathComplete = useCallback(async (path) => {
    if (!displayScene) return;
    const tempPath = { ...path, id: `temp-${Date.now()}` };
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        scenes: prev.scenes.map(s =>
          s.id === displayScene.id
            ? { ...s, drawingPaths: [...(s.drawingPaths || []), tempPath] }
            : s
        ),
      };
    });
    try {
      await addDrawingPath(gameId, displayScene.id, path);
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: prev.scenes.map(s =>
            s.id === displayScene.id
              ? { ...s, drawingPaths: (s.drawingPaths || []).filter(p => p.id !== tempPath.id) }
              : s
          ),
        };
      });
    } catch (err) {
      console.error('Failed to save drawing path:', err);
      setGameState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: prev.scenes.map(s =>
            s.id === displayScene.id
              ? { ...s, drawingPaths: (s.drawingPaths || []).filter(p => p.id !== tempPath.id) }
              : s
          ),
        };
      });
    }
  }, [gameId, displayScene]);

  const handleDeleteDrawingPath = useCallback(async (pathId) => {
    if (!displayScene || !pathId) return;
    try {
      await deleteDrawingPath(gameId, displayScene.id, pathId);
    } catch (err) {
      console.error('Failed to delete drawing path:', err);
    }
  }, [gameId, displayScene]);

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
        <Button variant="contained" onClick={onGoToGameList}>
          Back to Lobby
        </Button>
      </Box>
    );
  }

  return (
    <WindowManagerProvider>
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

      <Box sx={{
        flexGrow: 1,
        display: 'flex',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <PanelToggle
          position="right"
          isHidden={rightPanelHidden}
          onClick={() => setRightPanelHidden(!rightPanelHidden)}
        />

        <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
          <DragAndDropContext
            sceneSelector={(
              <div className="top-bars">
                <WindowBar collapsed={topBarsCollapsed} />
                {isGM && (
                  <SceneSelector
                    scenes={gameState?.scenes || []}
                    activeSceneId={displayScene?.id}
                    onSceneChange={setGmViewingSceneId}
                    participants={gameState?.participants || []}
                    gameId={gameId}
                    onSceneCreated={setGmViewingSceneId}
                    onAssignAll={handleSceneAssignAll}
                    collapsed={topBarsCollapsed}
                    onToggleCollapse={() => setTopBarsCollapsed(v => !v)}
                  />
                )}
              </div>
            )}
            addLogMessage={addLogMessage}
            gameId={gameId}
            token={token}
            gameSystem={gameState?.gameSystem}
            characterUpdateTrigger={characterUpdateTrigger}
            characterDataTrigger={characterDataTrigger}
            isHidden={leftPanelHidden}
            onTogglePanel={() => setLeftPanelHidden(!leftPanelHidden)}
            currentScene={displayScene}
            isGM={isGM}
            userId={userId}
            participants={gameState?.participants || []}
            editingLayer={editingLayer}
            onEditingLayerChange={setEditingLayer}
            fogCoverMode={fogCoverMode}
            onFogCoverModeChange={setFogCoverMode}
            sendMessage={sendMessage}
            pointerPings={pointerPings}
            onRemovePing={removePing}
            onFogPathComplete={handleFogPathComplete}
            activeTool={activeTool}
            onActiveToolChange={setActiveTool}
            brushSize={brushSize}
            onBrushSizeChange={setBrushSize}
            drawingColor={drawingColor}
            onDrawingColorChange={setDrawingColor}
            drawingFontSize={drawingFontSize}
            onDrawingFontSizeChange={setDrawingFontSize}
            onDrawingPathComplete={handleDrawingPathComplete}
            onDeleteDrawingPath={handleDeleteDrawingPath}
            currentSceneId={displayScene?.id}
            rollVisibility={rollVisibility}
            game={gameState}
            onlineUserIds={onlineUserIds}
            onParticipantUpdated={fetchGameState}
            controlScheme={controlScheme}
          />
        </Box>

        <RightPanel
          isHidden={rightPanelHidden}
          logs={logs}
          addLogMessage={addLogMessage}
          gameId={gameId}
          token={token}
          onLogout={onLogout}
          onGoToGameList={onGoToGameList}
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
          onlineUserIds={onlineUserIds}
          onParticipantUpdated={fetchGameState}
          rollVisibility={rollVisibility}
          onRollVisibilityChange={setRollVisibility}
          controlScheme={controlScheme}
          onControlSchemeChange={setControlScheme}
          minigameState={minigameState}
          onReopenMinigameBoard={() => setMinigameState(prev => prev)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </Box>

      {minigameState && minigameState.gameType === 'yahtzee' && (
        <YahtzeeBoardModal
          state={minigameState}
          gameId={gameId}
          userId={userId}
          isGM={isGM}
          onClose={() => setMinigameState(null)}
        />
      )}
      {minigameState && minigameState.gameType === 'dicepoker' && (
        <DicePokerBoardModal
          state={minigameState}
          gameId={gameId}
          userId={userId}
          isGM={isGM}
          onClose={() => setMinigameState(null)}
        />
      )}

      <ToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        onNavigateToLog={() => setActiveTab('chat')}
        onPauseAll={pauseAll}
        onResumeAll={resumeAll}
        gameSystem={gameState?.gameSystem}
      />

      <ConfirmModal
        isOpen={showBackConfirm}
        message={t('settings.backToGameListConfirm')}
        confirmLabel={t('settings.backToGameList')}
        onConfirm={() => {
          setShowBackConfirm(false);
          onGoToGameList();
        }}
        onCancel={() => setShowBackConfirm(false)}
      />
    </Box>
    </WindowManagerProvider>
  );
};

export default GameSession;
