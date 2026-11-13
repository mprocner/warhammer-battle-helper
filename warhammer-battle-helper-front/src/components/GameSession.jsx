import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Button, Typography, Alert, CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import usePageTitle from '../hooks/usePageTitle';
import ConfirmModal from './common/ConfirmModal';
import DragAndDropContext from './DndContext';
import RightPanel from './panels/RightPanel';
import PanelToggle from './panels/PanelToggle';
import useWebSocket from '../hooks/useWebSocket';
import useSceneCombat from '../hooks/useSceneCombat';
import { CombatProvider } from '../contexts/CombatContext';
import { useOnlineUsers } from '../hooks/useOnlineUsers';
import { useControlScheme } from '../hooks/useControlScheme';
import { useFogGmOpacity } from '../hooks/useFogGmOpacity';
import { useDiceAnimationSetting } from '../hooks/useDiceAnimationSetting';
import { useAccountBooleanSetting } from '../hooks/useAccountBooleanSetting';
import { resolveTheme } from '../theme/themes';
import { useApplyTheme } from '../theme/useApplyTheme';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useGameMusic } from '../hooks/useGameMusic';
import { useDrawingTools } from '../hooks/useDrawingTools';
import { participantColor } from '../utils/participants';
import { useFogTools } from '../hooks/useFogTools';
import { getApiUrl, getApiHeaders } from '../api/axios';
import { addFogPath, addDrawingPath, moveDrawingPaths, updateDrawingPath } from '../api/scenes';
import { translatePath } from './scene/drawingSelection';
import { getMinigameState } from '../api/minigame';
import SceneSelector from './scene/SceneSelector';
import WindowBar from './WindowBar';
import { WindowManagerProvider } from '../contexts/WindowManagerContext';
import { TutorialProvider } from './tutorial/TutorialContext';
import YahtzeeBoardModal from './minigame/YahtzeeBoardModal';
import DicePokerBoardModal from './minigame/DicePokerBoardModal';
import { WS_EVENTS } from '../websocket/events';
import ToastStack from './ToastStack';
import GameTour from './tutorial/engine/GameTour';
import { useToastQueue } from '../hooks/useToastQueue';
import { appendUnique } from '../utils/appendUnique';
import { stripUserFromCharacters } from '../utils/stripUserFromCharacters';
import { applyTokenViewPatch } from '../utils/applyTokenViewPatch';
import { sessionEndReasonForStatus } from '../utils/sessionAccess';
import { showsRollNotice } from '../utils/rollNotice';
import { createDiceController } from './dice3d/diceController';
import DiceAnimationContext from './dice3d/DiceAnimationContext';

const TOAST_ROLL_EVENTS = new Set([WS_EVENTS.DICE_ROLLED, WS_EVENTS.SKILL_ROLLED, WS_EVENTS.WEAPON_ROLLED]);
// Quiet time after the last text-label edit before the PATCH goes out (handleDrawingPathUpdate).
const TEXT_PATCH_DEBOUNCE_MS = 250;

/**
 * GameSession component - manages a multiplayer game session with real-time sync
 */
const GameSession = ({ gameId, token, onGoToGameList, onSessionEnded, onLogout }) => {
  const { t } = useTranslation();
  const [gameState, setGameState] = useState(null);
  // The tab shows the game's name once it has loaded; the lobby title covers the fetch.
  usePageTitle(gameState?.name || t('pageTitle.games'));
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
  const [fogGmOpacity, setFogGmOpacity] = useFogGmOpacity();
  const [diceAnimation, setDiceAnimation, diceAnimationLoaded] = useDiceAnimationSetting();
  const [ignoreGameTheme, setIgnoreGameTheme] = useAccountBooleanSetting('ignoreGameTheme');
  // The theme lives on <html> while this view is mounted (portals included), see useApplyTheme.
  useApplyTheme(resolveTheme(gameState?.appearance?.theme, ignoreGameTheme));
  // One controller per session; the scene's DiceOverlay attaches its canvas to it.
  const [diceController] = useState(() => createDiceController());
  const [minigameState, setMinigameState] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  // Licznik startu samouczka: każde podbicie uruchamia tour od nowa (przycisk "?").
  const [tutorialSignal, setTutorialSignal] = useState(0);
  // Gotowość ekranu gry dla auto-startu samouczka: DndContext renderuje placeholder
  // ładowania dopóki jego fetch postaci się nie skończy — do tego czasu w DOM nie ma
  // sidebara, sceny ani paska online-users, tylko to, co RightPanel montuje sam.
  const [gameScreenReady, setGameScreenReady] = useState(false);

  const { toasts, pushToast, dismissToast, pauseAll, resumeAll } = useToastQueue();
  const isGMRef = useRef(false);
  // Latest combat handlers for the WS switch, which is memoised with a deliberately short deps list.
  const combatRef = useRef(null);
  const userIdRef = useRef(null);
  // Read by the memoised WS handler, which must not re-subscribe on every state change.
  const diceAnimationRef = useRef(false);
  const participantsRef = useRef([]);

  const { userId } = useCurrentUser(token);
  const { onlineUserIds, handleOnlineUsersMessage } = useOnlineUsers();
  const { audioRef, musicState, playerVolume, onPlayerVolumeChange, onGmVolumeChange, handleMusicMessage, handleSceneAssignAll, syncFromGame } = useGameMusic(gameId);
  const { activeTool, setActiveTool, brushSize, setBrushSize, drawingColor, setDrawingColor, drawingTextStyle, updateDrawingTextStyle } = useDrawingTools(participantColor(gameState?.participants, userId));
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

  // Local-only scene patch for the GM's own live previews (e.g. the grid colour while the picker
  // is open). Never sent anywhere: the real save goes through the API, and the SCENE_UPDATED it
  // triggers refetches this state from the server.
  const previewScenePatch = useCallback((sceneId, patch) => {
    setGameState(prev => prev && {
      ...prev,
      scenes: (prev.scenes || []).map(s => (s.id === sceneId ? { ...s, ...patch } : s)),
    });
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
              message = t('log.session.playerLeftNamed', { name: event.username });
              return { createdAt, message, type: 'info', timestamp };
            case 'character_add':
              message = t('log.session.characterAddedBy', { name: event.username });
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
  }, [gameId, token, historyLoaded, syncFromGame, onSessionEnded, t]);

  const removePing = useCallback((pingId) => {
    setPointerPings(prev => prev.filter(p => p.id !== pingId));
  }, []);

  const handleWebSocketMessage = useCallback((message) => {
    // Delegate music events to the dedicated hook
    if (handleMusicMessage(message)) return;

    // Fresh roll notices — toast and 3D dice — share one visibility gate. Only live WS events
    // reach here: history and GAME_STATE never replay as dice.
    if (TOAST_ROLL_EVENTS.has(message.type)) {
      const roll = message.payload;
      if (showsRollNotice(roll?.visibility, { isGM: isGMRef.current, userId: userIdRef.current })) {
        pushToast(roll);
        if (diceAnimationRef.current) {
          diceController.play({
            dice: roll?.dice,
            color: participantColor(participantsRef.current, roll?.rollerUserId || roll?.userId),
          });
        }
      }
    }

    switch (message.type) {
      case WS_EVENTS.GAME_STATE:
        setGameState(message.payload.game);
        addLogMessage(t('log.session.synchronized'), 'info');
        setLoading(false);
        break;

      case WS_EVENTS.GAME_DELETED:
        onSessionEnded('gameNotFound');
        break;

      // The GM kicked us. Arrives on the still-live socket, just before the server closes it,
      // so we leave immediately instead of waiting out the reconnect backoff and probing.
      // Unmounting runs the hook's cleanup, which suppresses the reconnect loop.
      case WS_EVENTS.KICKED_FROM_GAME:
        onSessionEnded('kickedFromGame');
        break;

      case WS_EVENTS.TOKEN_CONFIG_UPDATED:
        // The GM's per-user token config changed; re-fetch so resolve-on-read supplies
        // the fresh config to every connected client (players included).
        fetchGameState();
        break;

      case WS_EVENTS.GAME_IMAGE_UPDATED:
        setGameState(prev => prev ? { ...prev, imageUrl: message.payload.imageUrl || '' } : prev);
        break;

      case WS_EVENTS.GAME_APPEARANCE_UPDATED:
        // GM picked another theme — refetch so every client switches together.
        fetchGameState();
        break;

      case WS_EVENTS.GAME_MAP_SETTINGS_UPDATED:
        // GM changed snap/free placement or the distance metric — refetch so every client
        // applies the same shared rule.
        fetchGameState();
        break;

      case WS_EVENTS.PARTICIPANT_JOINED: {
        const newParticipant = message.payload.participant;
        addLogMessage(t('log.session.playerJoined', { name: newParticipant.username }), 'success');
        setGameState(prev => {
          if (!prev) return prev;
          const already = (prev.participants || []).some(p => p.userId === newParticipant.userId);
          if (already) return prev;
          return { ...prev, participants: [...(prev.participants || []), newParticipant] };
        });
        break;
      }

      case WS_EVENTS.PARTICIPANT_LEFT:
        addLogMessage(t('log.session.playerLeft'), 'info');
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
        const { userId: updUserId, avatar, avatarType, avatarCharacterId, avatarCharacterUrl, signature, avatarSize, showSignature, color } = message.payload;
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            participants: (prev.participants || []).map(p =>
              p.userId === updUserId
                ? { ...p, avatar, avatarType, avatarCharacterId, avatarCharacterUrl, signature, avatarSize, showSignature, color }
                : p
            ),
          };
        });
        break;
      }

      case WS_EVENTS.CHARACTER_ADDED:
        addLogMessage(t('log.session.characterAdded'), 'success');
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
        combatRef.current?.onSourcesChanged(); // tracker entries are resolved and pruned server-side
        addLogMessage(t('log.session.characterRemoved'), 'info');
        setGameState(prev => {
          if (!prev) return prev;
          return { ...prev, characters: (prev.characters || []).filter(c => c.id !== message.payload.characterId) };
        });
        setCharacterUpdateTrigger(prev => prev + 1);
        break;

      case WS_EVENTS.CHARACTER_UPDATED: {
        combatRef.current?.onSourcesChanged(); // tracker entries are resolved and pruned server-side
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
        // Granting/revoking a card also changes which hidden tokens we may receive —
        // FilterSceneCharacterTokensForUser decides that, so refetch the scene. The local
        // visibleTo update above stays: the visibility modal must react instantly.
        fetchGameState();
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
        // The payload is only { sceneId }: a scene sent to everyone would skip the per-viewer filters,
        // and swapping it in brought hidden tokens back for players (PLAYRPG-351). Refetch instead.
        fetchGameState();
        break;

      case WS_EVENTS.SCENE_DELETED:
        combatRef.current?.onSourcesChanged(); // tracker entries are resolved and pruned server-side
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
        // The moved player is about to see a scene they were not looking at, straight from local
        // state. Refetch so they enter it with the server-filtered view, not whatever that state
        // picked up while they were elsewhere. The local patch above stays: the scene switch is instant.
        if (assigned && playerId === userIdRef.current) fetchGameState();
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
        combatRef.current?.onSourcesChanged(); // tracker entries are resolved and pruned server-side
        // Token visibility toggled. Refetch instead of mutating locally: the rule
        // "hidden && no card" lives only in FilterSceneCharacterTokensForUser, so only a
        // refetch drops the token for a player without the card, keeps it for a card-holder,
        // and delivers the hidden flag the GM's dimming needs. The event payload is bare.
        fetchGameState();
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

      case WS_EVENTS.SCENE_CHARACTER_TOKEN_VIEW_UPDATED: {
        combatRef.current?.onSourcesChanged(); // killed/name/avatar of a card-less viewer's tracker entry
        // A card-less viewer's live token refresh. The server sends the already-masked projection
        // (never raw gear), computed once for the whole card-less class. Merged in place, with no
        // refetch: nothing in this event can change WHICH tokens this viewer may see — every change
        // that could still goes through SCENE_CHARACTER_UPDATED / CHARACTER_VISIBILITY_UPDATED and
        // their full fetchGameState().
        //
        // Deliberately NO setCharacterUpdateTrigger here, unlike its sibling cases: that trigger
        // makes DndContext refetch GET /games/:id in full, which is the exact cost this event
        // exists to avoid — and it could not help anyway, since the map token renders from
        // currentScene.characters (this very state) and this event's audience never holds the
        // character document the refetch would return.
        setGameState(prev => applyTokenViewPatch(prev, message.payload.views));
        break;
      }

      case WS_EVENTS.SCENE_CHARACTER_REMOVED:
        combatRef.current?.onSourcesChanged(); // tracker entries are resolved and pruned server-side
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
        combatRef.current?.onSourcesChanged(); // tracker entries are resolved and pruned server-side
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
        combatRef.current?.onSourcesChanged(); // tracker entries are resolved and pruned server-side
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
        combatRef.current?.onSourcesChanged(); // tracker entries are resolved and pruned server-side
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
          const { sceneId, fogEnabled } = message.payload;
          return {
            ...prev,
            scenes: prev.scenes.map(s =>
              s.id === sceneId ? { ...s, fogEnabled } : s
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

      // Drawing changes always come as batches (a single path is a batch of one).
      case WS_EVENTS.DRAWING_PATHS_ADDED:
      case WS_EVENTS.DRAWING_PATHS_UPDATED:
      case WS_EVENTS.DRAWING_PATHS_REMOVED: {
        const { sceneId, paths = [], pathIds = [] } = message.payload;
        const byId = new Map(paths.map(p => [p.id, p]));
        const removed = new Set(pathIds);
        const apply = {
          [WS_EVENTS.DRAWING_PATHS_ADDED]: (list) => [...list.filter(p => !byId.has(p.id)), ...paths],
          [WS_EVENTS.DRAWING_PATHS_UPDATED]: (list) => list.map(p => byId.get(p.id) || p),
          [WS_EVENTS.DRAWING_PATHS_REMOVED]: (list) => list.filter(p => !removed.has(p.id)),
        }[message.type];
        setGameState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            scenes: prev.scenes.map(s =>
              s.id === sceneId ? { ...s, drawingPaths: apply(s.drawingPaths || []) } : s
            ),
          };
        });
        break;
      }

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
        const { x, y, sceneId, userId: pingUserId } = message.payload;
        const ping = { id: `${Date.now()}-${Math.random()}`, x, y, sceneId, userId: pingUserId };
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

      case WS_EVENTS.SCENE_COMBAT_UPDATED:
        combatRef.current?.onCombatEvent(message.payload.sceneId);
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchGameState, addLogMessage, handleOnlineUsersMessage, handleMusicMessage, onSessionEnded, pushToast, diceController, t]);

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
  // Switching the dice off sweeps the table and stops the sound at once, mid-roll included.
  useEffect(() => {
    if (!diceAnimation) diceController.stop();
  }, [diceAnimation, diceController]);
  useEffect(() => () => diceController.dispose(), [diceController]);

  // Until the saved choice has loaded, nothing animates — a user who turned the dice off
  // must never download the 3D chunk.
  diceAnimationRef.current = diceAnimation && diceAnimationLoaded;
  participantsRef.current = gameState?.participants || [];

  // Nowy obiekt przy każdej zmianie widoczności paneli — hook samouczka czeka
  // dokładnie na tę zmianę, zanim wpuści krok, którego kotwica siedzi w panelu.
  const tourPanels = useMemo(
    () => ({ leftHidden: leftPanelHidden, rightHidden: rightPanelHidden, topCollapsed: topBarsCollapsed }),
    [leftPanelHidden, rightPanelHidden, topBarsCollapsed]
  );

  const revealForTour = useCallback((step) => {
    if (step.reveal === 'left') setLeftPanelHidden(false);
    if (step.reveal === 'right') setRightPanelHidden(false);
    if (step.reveal === 'top') setTopBarsCollapsed(false);
  }, []);

  // Stabilna referencja: DndContext trzyma ten callback w tablicy zależności swojego
  // efektu, więc inline arrow odpalałby go przy każdym renderze tego komponentu.
  const handleCharactersLoaded = useCallback(() => setGameScreenReady(true), []);

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

  const combatState = useSceneCombat(gameId, displayScene?.id, isGM);
  combatRef.current = combatState;

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
    const tempPath = { ...path, id: `temp-${Date.now()}`, userId };
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
  }, [gameId, displayScene, userId]);

  // Text label edits (content, move, style). The label changes locally at once; the request
  // waits until the edits stop for TEXT_PATCH_DEBOUNCE_MS and carries every field changed in
  // the meantime, so dragging a slider sends one PATCH, not one per step. The server's
  // DRAWING_PATHS_UPDATED then replaces the label with the stored, normalized version.
  const pendingTextPatchesRef = useRef(new Map());
  useEffect(() => {
    const pending = pendingTextPatchesRef.current;
    return () => pending.forEach(({ timer }) => clearTimeout(timer));
  }, []);

  const handleDrawingPathUpdate = useCallback((pathId, patch) => {
    // A label still waiting for its server id cannot be addressed yet.
    if (!displayScene || !pathId || String(pathId).startsWith('temp-')) return;
    const sceneId = displayScene.id;
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        scenes: prev.scenes.map(s =>
          s.id === sceneId
            ? { ...s, drawingPaths: (s.drawingPaths || []).map(p => (p.id === pathId ? { ...p, ...patch } : p)) }
            : s
        ),
      };
    });

    const pending = pendingTextPatchesRef.current;
    const entry = pending.get(pathId);
    clearTimeout(entry?.timer);
    const merged = { ...entry?.patch, ...patch };
    const timer = setTimeout(async () => {
      pending.delete(pathId);
      try {
        await updateDrawingPath(gameId, sceneId, pathId, merged);
      } catch (err) {
        // The local edit stays until the next refetch; the next WS update or reload corrects it.
        console.error('Failed to update drawing path:', err);
      }
    }, TEXT_PATCH_DEBOUNCE_MS);
    pending.set(pathId, { patch: merged, timer });
  }, [gameId, displayScene]);

  // Group move of drawings (select tool). The paths move locally at once — otherwise they would
  // jump back until DRAWING_PATHS_UPDATED arrives — and the server's answer replaces them.
  const handleMoveDrawingPaths = useCallback(async (pathIds, dx, dy) => {
    if (!displayScene || pathIds.length === 0) return;
    const sceneId = displayScene.id;
    const moved = new Set(pathIds);
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        scenes: prev.scenes.map(s =>
          s.id === sceneId
            ? { ...s, drawingPaths: (s.drawingPaths || []).map(p => (moved.has(p.id) ? translatePath(p, dx, dy) : p)) }
            : s
        ),
      };
    });
    try {
      await moveDrawingPaths(gameId, sceneId, pathIds, dx, dy);
    } catch (err) {
      console.error('Failed to move drawing paths:', err);
      fetchGameState();
    }
  }, [gameId, displayScene, fetchGameState]);

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
            fontFamily: 'var(--font-display)',
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
    <DiceAnimationContext.Provider value={diceController}>
    <WindowManagerProvider>
    <TutorialProvider>
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {wsError && (
        <Alert severity="warning" sx={{ m: 2 }}>
          {t('game.connectionLost')}
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
          <CombatProvider gameId={gameId} scene={displayScene} isGM={isGM} combatState={combatState}>
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
              // Players have no layer bar, and Select needs the tokens layer armed to touch a
              // character token at all — so their armed layer is fixed.
              imageEditLayer={isGM ? imageEditLayer : 'tokens'}
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
              fogGmOpacity={fogGmOpacity}
              onFogGmOpacityChange={setFogGmOpacity}
              drawingColor={drawingColor}
              onDrawingColorChange={setDrawingColor}
              drawingTextStyle={drawingTextStyle}
              onDrawingTextStyleChange={updateDrawingTextStyle}
              onDrawingPathComplete={handleDrawingPathComplete}
              onUpdateDrawingPath={handleDrawingPathUpdate}
              onMoveDrawingPaths={handleMoveDrawingPaths}
              currentSceneId={displayScene?.id}
              rollVisibility={rollVisibility}
              game={gameState}
              onlineUserIds={onlineUserIds}
              onParticipantUpdated={fetchGameState}
              controlScheme={controlScheme}
              onCharactersLoaded={handleCharactersLoaded}
            />
          </CombatProvider>
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
          onPreviewScene={previewScenePatch}
          imageEditLayer={imageEditLayer}
          musicState={musicState}
          audioRef={audioRef}
          playerVolume={playerVolume}
          onPlayerVolumeChange={onPlayerVolumeChange}
          onGmVolumeChange={onGmVolumeChange}
          onlineUserIds={onlineUserIds}
          onParticipantUpdated={fetchGameState}
          rollVisibility={rollVisibility}
          onRollVisibilityChange={setRollVisibility}
          controlScheme={controlScheme}
          onControlSchemeChange={setControlScheme}
          diceAnimation={diceAnimation}
          onDiceAnimationChange={setDiceAnimation}
          ignoreGameTheme={!!ignoreGameTheme}
          onIgnoreGameThemeChange={setIgnoreGameTheme}
          minigameState={minigameState}
          onReopenMinigameBoard={() => setMinigameState(prev => prev)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onStartTutorial={() => setTutorialSignal(n => n + 1)}
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

      <GameTour
        role={gameState ? (isGM ? 'gm' : 'player') : null}
        controlScheme={controlScheme}
        panels={tourPanels}
        onReveal={revealForTour}
        startSignal={tutorialSignal}
        screenReady={gameScreenReady}
      />

      <ToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        onNavigateToLog={() => setActiveTab('chat')}
        onPauseAll={pauseAll}
        onResumeAll={resumeAll}
        gameSystem={gameState?.gameSystem}
        participants={gameState?.participants}
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
    </TutorialProvider>
    </WindowManagerProvider>
    </DiceAnimationContext.Provider>
  );
};

export default GameSession;
