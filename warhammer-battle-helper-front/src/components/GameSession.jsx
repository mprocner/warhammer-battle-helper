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
import { appendUnique } from '../utils/appendUnique';
import { stripUserFromCharacters } from '../utils/stripUserFromCharacters';
import { sessionEndReasonForStatus } from '../utils/sessionAccess';

const TOAST_ROLL_EVENTS = new Set([WS_EVENTS.DICE_ROLLED, WS_EVENTS.SKILL_ROLLED, WS_EVENTS.WEAPON_ROLLED]);

/**
 * GameSession component - manages a multiplayer game session with real-time sync
 */
const GameSession = ({ gameId, token, onGoToGameList, onSessionEnded, onLogout }) => {
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
  // Ephemeral distance rulers from other players, keyed by userId (one live ruler per player).
  const [mapRulers, setMapRulers] = useState({});
  const rulerTimersRef = useRef({});
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [rollVisibility, setRollVisibility] = useState('all');
  const [controlScheme, setControlScheme] = useControlScheme();
  const [minigameState, setMinigameState] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');

  const { toasts, pushToast, dismissToast, pauseAll, resumeAll } = useToastQueue();
  const isGMRef = useRef(false);
  const userIdRef = useRef(null);

  const { userId } = useCurrentUser(token);
  const { onlineUserIds, handleOnlineUsersMessage } = useOnlineUsers();
  const { audioRef, musicState, playerVolume, onPlayerVolumeChange, handleMusicMessage, handleSceneAssignAll, syncFromGame } = useGameMusic(gameId);
  const { activeTool, setActiveTool, brushSize, setBrushSize, drawingColor, setDrawingColor, drawingFontSize, setDrawingFontSize } = useDrawingTools();
  const { editingLayer, setEditingLayer, fogCoverMode, setFogCoverMode, imageEditLayer, setImageEditLayer } = useFogTools();

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

  // Resolves true when the game state loaded successfully, and false when the session
  // ended (access revoked / game gone) or the request failed. useWebSocket uses this
  // answer to decide whether to re-arm the socket after a reconnect probe.
  const fetchGameState = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}`, {
        headers: getApiHeaders({
          'Authorization': `Bearer ${token}`
        })
      });

      const reason = sessionEndReasonForStatus(response.status);
      if (reason) { setLoading(false); onSessionEnded(reason); return false; }

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
              return { createdAt, message, type: event.data.type || 'info', timestamp, data: { username: event.username, userId: event.createdBy, visibility: event.data.visibility } };
            default:
              return null;
          }
        }).flat().filter(log => log !== null).map(log => ({ id: crypto.randomUUID(), ...log }));

        setLogs(historicalLogs);
        setHistoryLoaded(true);
      }

      setLoading(false);
      return true;
    } catch (err) {
      console.error('Failed to fetch game state:', err);
      setError(err.message);
      setLoading(false);
      return false;
    }
  }, [gameId, token, historyLoaded, syncFromGame, onSessionEnded]);

  const removePing = useCallback((pingId) => {
    setPointerPings(prev => prev.filter(p => p.id !== pingId));
  }, []);

  const handleWebSocketMessage = useCallback((message) => {
    // Delegate music events to the dedicated hook
    if (handleMusicMessage(message)) return;

    // Push roll notifications — skip gm_only rolls for non-GM users
    if (TOAST_ROLL_EVENTS.has(message.type)) {
      const vis = message.payload?.visibility;
      if (!vis || vis === 'all' || isGMRef.current || vis === userIdRef.current) {
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
        onSessionEnded('gameNotFound');
        break;

      case WS_EVENTS.TOKEN_CONFIG_UPDATED:
        // The GM's per-user token config changed; re-fetch so resolve-on-read supplies
        // the fresh config to every connected client (players included).
        fetchGameState();
        break;

      case WS_EVENTS.GAME_IMAGE_UPDATED:
        setGameState(prev => prev ? { ...prev, imageUrl: message.payload.imageUrl || '' } : prev);
        break;

      case WS_EVENTS.GAME_MAP_SETTINGS_UPDATED:
        // GM changed snap/free placement or the distance metric — refetch so every client
        // applies the same shared rule.
        fetchGameState();
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
          return {
            ...prev,
            participants: (prev.participants || []).filter(p => p.userId !== message.payload.userId),
            characters: stripUserFromCharacters(prev.characters, message.payload.userId),
          };
        });
        setCharacterDataTrigger(prev => prev + 1);
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
          { username: message.payload.username, userId: message.payload.userId, visibility: message.payload.visibility }
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
          // A full fetchGameState may already carry this handout — appending blindly
          // would leave two entries sharing one id.
          return { ...prev, handouts: appendUnique(prev.handouts, message.payload.handout) };
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
          return { ...prev, handoutFolders: appendUnique(prev.handoutFolders, message.payload.folder) };
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
        const { sceneId: scId, characterId: scCharId, x: scX, y: scY, w: scW, h: scH, zIndex: scZ, rotation: scRot } = message.payload;
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            scenes: (prev.scenes || []).map(s =>
              s.id === scId
                ? {
                    ...s,
                    // Move sends x/y; resize sends w/h; apply whichever the payload carries so a
                    // resize propagates to every client (not just position changes).
                    characters: (s.characters || []).map(c =>
                      c.characterId === scCharId || c.id === scCharId
                        ? {
                            ...c,
                            ...(scX !== undefined ? { positionX: scX } : {}),
                            ...(scY !== undefined ? { positionY: scY } : {}),
                            ...(scW !== undefined ? { w: scW } : {}),
                            ...(scH !== undefined ? { h: scH } : {}),
                            ...(scZ !== undefined ? { zIndex: scZ } : {}),
                            ...(scRot !== undefined ? { rotation: scRot } : {}),
                          }
                        : c
                    ),
                  }
                : s
            ),
          };
        });
        setCharacterUpdateTrigger(prev => prev + 1);
        break;
      }

      case WS_EVENTS.SCENE_CHARACTER_UPDATED: {
        // Token visibility toggled. Update the placement's hidden flag locally (drives the GM's
        // dimmed styling + eye state) and refetch scene characters — the server filter then drops
        // the token for players without the card.
        const { sceneId: scuSceneId, characterId: scuCharId, hidden: scuHidden } = message.payload;
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            scenes: (prev.scenes || []).map(s =>
              s.id === scuSceneId
                ? {
                    ...s,
                    characters: (s.characters || []).map(c =>
                      c.characterId === scuCharId ? { ...c, hidden: scuHidden } : c
                    ),
                  }
                : s
            ),
          };
        });
        setCharacterUpdateTrigger(prev => prev + 1);
        break;
      }

      case WS_EVENTS.SCENE_CHARACTER_TOKEN_UPDATED: {
        // Two shapes:
        //  - live value bump (granular endpoint): payload carries fresh raw gear (GM/card-holders
        //    only) → optimistic local update, keeps play-time +/- snappy.
        //  - config-panel Save (whole-gear PUT): payload has NO gear → refetch the whole game so
        //    EVERY viewer (including card-less players) re-masks with the new visibility.
        const { sceneId: sctSceneId, placementId: sctPlacementId, tokenGear: sctGear } = message.payload;
        if (sctGear === undefined) {
          fetchGameState();
          break;
        }
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            scenes: (prev.scenes || []).map(s =>
              s.id === sctSceneId
                ? { ...s, characters: (s.characters || []).map(c => c.id === sctPlacementId ? { ...c, tokenGear: sctGear } : c) }
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
                // Match by characterId (the payload's id) OR placement id — mirrors SCENE_CHARACTER_MOVED.
                // Matching only c.id (the placement id) never hit, so removal fell back to a refetch;
                // two concurrent group removals then raced their refetches and dropped only one token.
                ? { ...s, characters: (s.characters || []).filter(c => c.characterId !== scRCharId && c.id !== scRCharId) }
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

      case WS_EVENTS.SCENE_IMAGE_TOKEN_UPDATED:
        setGameState(prev => {
          if (!prev) return prev;
          const { sceneId: sitSceneId, imageId: sitImageId, tokenOverlay } = message.payload;
          return {
            ...prev,
            scenes: (prev.scenes || []).map(s =>
              s.id === sitSceneId
                ? {
                    ...s,
                    images: (s.images || []).map(img =>
                      img.id === sitImageId ? { ...img, tokenOverlay } : img
                    ),
                  }
                : s
            ),
          };
        });
        break;

      case WS_EVENTS.SCENE_TOKENS_MOVED: {
        const { sceneId: stmSceneId, images: stmImages = [], characters: stmChars = [] } = message.payload;
        const imgMap = new Map(stmImages.map(i => [i.id, i]));
        const charMap = new Map(stmChars.map(c => [c.id, c]));
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            scenes: (prev.scenes || []).map(s =>
              s.id === stmSceneId
                ? {
                    ...s,
                    images: (s.images || []).map(img =>
                      imgMap.has(img.id) ? { ...img, x: imgMap.get(img.id).x, y: imgMap.get(img.id).y } : img
                    ),
                    characters: (s.characters || []).map(c =>
                      charMap.has(c.characterId)
                        ? { ...c, positionX: charMap.get(c.characterId).positionX, positionY: charMap.get(c.characterId).positionY }
                        : c
                    ),
                  }
                : s
            ),
          };
        });
        setCharacterUpdateTrigger(prev => prev + 1);
        break;
      }

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

      case WS_EVENTS.MAP_RULER: {
        // A player's live measuring ruler (ephemeral, never persisted). One ruler per player;
        // active:false clears it. A safety timeout drops it if the sender disconnects mid-drag.
        const { userId: ruId, name, from, to, active, sceneId, aoe } = message.payload;
        if (ruId === userId) break; // our own echo — shown locally already
        clearTimeout(rulerTimersRef.current[ruId]);
        setMapRulers(prev => {
          const next = { ...prev };
          if (active) next[ruId] = { userId: ruId, name, from, to, sceneId, aoe };
          else delete next[ruId];
          return next;
        });
        if (active) {
          rulerTimersRef.current[ruId] = setTimeout(() => {
            setMapRulers(prev => { const n = { ...prev }; delete n[ruId]; return n; });
          }, 3000);
        }
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
  }, [fetchGameState, addLogMessage, handleOnlineUsersMessage, handleMusicMessage, onSessionEnded, pushToast]);

  const { isConnected, error: wsError, sendMessage } = useWebSocket(
    gameId,
    token,
    handleWebSocketMessage,
    fetchGameState
  );

  useEffect(() => {
    fetchGameState();
  }, [fetchGameState]);

  const isGM = gameState?.gameMasterId === userId;
  isGMRef.current = isGM;
  userIdRef.current = userId;

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
            imageEditLayer={imageEditLayer}
            onImageEditLayerChange={setImageEditLayer}
            fogCoverMode={fogCoverMode}
            onFogCoverModeChange={setFogCoverMode}
            sendMessage={sendMessage}
            pointerPings={pointerPings}
            onRemovePing={removePing}
            mapRulers={mapRulers}
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
          imageEditLayer={imageEditLayer}
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
