import React, {useCallback, useEffect, useRef, useState} from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl, getApiHeaders } from '../api/axios';
import CharacterDetailsPanel from './CharacterDetailsPanel';
import CloneCharacterModal from './CloneCharacterModal';
import CharacterVisibilityModal from './CharacterVisibilityModal';
import SceneViewport from './scene/SceneViewport';
import DrawingToolbar from './scene/DrawingToolbar';
import OnlineUsersBar from './online-users/OnlineUsersBar';
import PlayerSettingsPopup from './online-users/PlayerSettingsPopup';
import { undoLastDrawingPath, clearDrawingPaths, undoLastFogPath, clearFogPaths, revealAllFog, deleteDrawingPath } from '../api/scenes';
import ConfirmModal from './common/ConfirmModal';
import ResizableSplitPane from './common/ResizableSplitPane';
import CharacterSidebarList from './CharacterSidebarList';
import CharacterSheetHost from './CharacterSheetHost';
import { normalizeCharacter } from '../systems/registry';
import { resolveDisplayName } from '../utils/participants';
import { useWindowManager } from '../contexts/WindowManagerContext';

const DEFAULT_GRID_WIDTH = 20;
const DEFAULT_GRID_HEIGHT = 20;

const generateFightZones = (width, height) => {
  const w = width || DEFAULT_GRID_WIDTH;
  const h = height || DEFAULT_GRID_HEIGHT;
  const zones = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      zones.push({ id: `zone-${r}-${c}`, row: r, col: c, character: null });
    }
  }
  return zones;
};


function DragAndDropContext({ addLogMessage, gameId = null, token = null, gameSystem = 'warhammer4e', characterUpdateTrigger = 0, characterDataTrigger = 0, isHidden = false, onTogglePanel, currentScene = null, isGM = false, userId = null, participants = [], editingLayer = 'grid', onEditingLayerChange, imageEditLayer = 'background', onImageEditLayerChange, fogCoverMode = false, onFogCoverModeChange, sendMessage = null, pointerPings = [], onRemovePing, mapRulers = {}, onFogPathComplete, activeTool = 'freehand', onActiveToolChange, brushSize = 10, onBrushSizeChange, drawingColor = '#ff0000', onDrawingColorChange, drawingFontSize = 16, onDrawingFontSizeChange, onDrawingPathComplete, onDeleteDrawingPath, currentSceneId = null, sceneSelector = null, rollVisibility = 'all', game = null, onlineUserIds = [], onParticipantUpdated, controlScheme = 'modern' }) {
  const { t } = useTranslation();
  const [playerSettingsOpen, setPlayerSettingsOpen] = useState(false);
  const [initialCharacters, setInitialCharacters] = useState([]);
  const gridWidth = currentScene?.gridWidth || DEFAULT_GRID_WIDTH;
  const gridHeight = currentScene?.gridHeight || DEFAULT_GRID_HEIGHT;
  const sceneId = currentScene?.id || null;
  const sceneIdRef = useRef(sceneId);
  useEffect(() => { sceneIdRef.current = sceneId; }, [sceneId]);

  const fightZonesRef = useRef(generateFightZones(gridWidth, gridHeight));
  const [fightZones, setFightZones] = useState(fightZonesRef.current);
  const [characters, setCharacters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // Optimistic character size override (characterId -> {w,h}). The scene's embedded w/h isn't
  // refreshed after a resize (no full gameState refetch), so without this a reconciliation remount
  // would reset the token to its stale placement size. Cleared on scene change.
  const [charGeomOverride, setCharGeomOverride] = useState({});
  useEffect(() => { setCharGeomOverride({}); }, [currentSceneId]);
  // Per-game map rules + own display name (name is stamped on broadcast drag rulers).
  const tokenPlacementMode = game?.mapSettings?.tokenPlacementMode || 'snap';
  const measurementMetric = game?.mapSettings?.measurementMetric || 'euclidean';
  // Ruler scale: one cell = cellDistance × unit (custom → free-text label). Defaults 5 ft.
  const cellDistance = game?.mapSettings?.cellDistance || 5;
  const rawUnit = game?.mapSettings?.distanceUnit || 'ft';
  const distanceUnit = rawUnit === 'custom' ? (game?.mapSettings?.customUnit || '') : rawUnit;
  const userName = resolveDisplayName(participants.find(p => p.userId === userId)) || '';

  // Live measuring ruler while dragging a token (grab point → current position). Shown locally
  // AND broadcast to other players over the same MAP_RULER channel as the manual ruler tool.
  const [imageDragRuler, setImageDragRuler] = useState(null);
  const [aoeMeasure, setAoeMeasure] = useState(true); // AoE circle toggle for the manual ruler tool
  const dragRulerFromRef = useRef(null);
  const lastDragRulerSendRef = useRef(0);
  const sendDragRuler = useCallback((from, to, active) => {
    if (!sendMessage) return;
    if (active) {
      const now = Date.now();
      if (now - lastDragRulerSendRef.current < 50) return; // throttle live updates
      lastDragRulerSendRef.current = now;
    }
    sendMessage('MAP_RULER', { sceneId: currentSceneId, userId, name: userName, from, to, active, aoe: false });
  }, [sendMessage, currentSceneId, userId, userName]);

  // Image-token drags feed the ruler via callbacks; character drags derive it from activeId/overId.
  const handleTokenDragMeasureStart = useCallback((center) => {
    dragRulerFromRef.current = center;
    setImageDragRuler({ from: center, to: center });
    sendDragRuler(center, center, true);
  }, [sendDragRuler]);
  const handleTokenDragMeasureMove = useCallback((center) => {
    const from = dragRulerFromRef.current;
    setImageDragRuler(from ? { from, to: center } : null);
    if (from) sendDragRuler(from, center, true);
  }, [sendDragRuler]);
  const handleTokenDragMeasureEnd = useCallback(() => {
    const from = dragRulerFromRef.current;
    dragRulerFromRef.current = null;
    setImageDragRuler(null);
    sendDragRuler(from, from, false);
  }, [sendDragRuler]);

  const [, setViewportZoom] = useState(1);
  const hasInitializedRef = useRef(false);

  // Selected character for details panel
  const [selectedCharacter, setSelectedCharacter] = useState(null);

  // Active token on the grid (sun/ring expansion) — independent of the card. Id only,
  // because FightArea resolves the live character from fightZones (like resolveCharacter).
  const [activeTokenId, setActiveTokenId] = useState(null);
  // Selected image-token (tokens-layer scene image with an expanded ring). Mutually exclusive
  // with activeTokenId — only one ring is open at a time, character or image.
  const [selectedImageTokenId, setSelectedImageTokenId] = useState(null);

  // Otwarte karty postaci (multi-open) — lista id postaci
  const [openCharacterIds, setOpenCharacterIds] = useState([]);
  const { focusWindow } = useWindowManager();

  const openCharacterSheet = useCallback((id) => {
    if (!id) return;
    setOpenCharacterIds(prev => (prev.includes(id) ? prev : [...prev, id]));
    // Dedup: klik w już otwartą postać tylko podnosi okno na wierzch
    focusWindow(`characterSheet:${id}`);
  }, [focusWindow]);

  const closeCharacterSheet = useCallback((id) => {
    setOpenCharacterIds(prev => prev.filter(x => x !== id));
  }, []);

  // Żywa postać rozwiązana po id — z siatki, puli lub listy bazowej
  const resolveCharacter = useCallback((id) => {
    const fromZone = fightZones.find(z => z.character?.id === id)?.character;
    if (fromZone) return fromZone;
    const fromPool = characters.find(c => c.id === id);
    if (fromPool) return fromPool;
    return initialCharacters.find(c => c.id === id) || null;
  }, [fightZones, characters, initialCharacters]);

  // Clone character popup
  const [cloneTarget, setCloneTarget] = useState(null);

  // Visibility management popup (GM only)
  const [visibilityTarget, setVisibilityTarget] = useState(null);

  // Delete character confirm
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Collapsible character list sections (kept here so handleAddCharacter/handleAddNPC can expand them)
  const [pcListCollapsed, setPcListCollapsed] = useState(false);
  const [npcListCollapsed, setNpcListCollapsed] = useState(false);

  const characterTileRefs = useRef({});

  // Scroll selected character tile into view when selection changes
  useEffect(() => {
    if (selectedCharacter) {
      const el = characterTileRefs.current[selectedCharacter.id];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedCharacter]);

  // Keep fightZonesRef in sync with fightZones state
  useEffect(() => {
    fightZonesRef.current = fightZones;
  }, [fightZones]);

  // Clear the active token when its character leaves the grid for any reason
  // (grid-toggle off, drag back to the pool, delete, scene switch, WS refetch).
  // Mirrors the selectedDrawingPathId cleanup pattern below.
  useEffect(() => {
    if (!activeTokenId) return;
    if (!fightZones.some(z => z.character?.id === activeTokenId)) setActiveTokenId(null);
  }, [fightZones, activeTokenId]);

  // Regenerate zones when scene changes (dimensions or scene id)
  const prevSceneRef = useRef(null);
  useEffect(() => {
    const sceneKey = `${sceneId}-${gridWidth}-${gridHeight}`;
    if (prevSceneRef.current !== sceneKey) {
      prevSceneRef.current = sceneKey;
      const newZones = generateFightZones(gridWidth, gridHeight);
      fightZonesRef.current = newZones;
      setFightZones(newZones);
      // Re-fetch game characters after zone reset
      if (gameId && token) {
        fetchGameCharacters();
      }
    }
  }, [sceneId, gridWidth, gridHeight, gameId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if the current user can interact with a character (createdBy or visibleTo)
  const isOwnCharacter = useCallback((characterId) => {
    if (isGM) return true;
    const char = initialCharacters.find(c => c.id === characterId);
    if (!char) return false;
    if (char.createdBy === userId) return true;
    return (char.visibleTo || []).includes(userId);
  }, [isGM, initialCharacters, userId]);

  // Select character to show details panel
  const handleSelectCharacter = (character) => {
    // Only allow selecting own characters in multiplayer mode (GM can select any)
    if (gameId && token && !isGM && !isOwnCharacter(character.id)) {
      return;
    }

    // Always use the most up-to-date character data from initialCharacters
    const freshChar = initialCharacters.find(c => c.id === character.id) || character;
    // Clicking the already-selected token toggles it off (same as clicking outside).
    setSelectedCharacter(prev => (prev?.id === character.id ? null : freshChar));
  };

  // Select/toggle the active token on the grid (sun/ring). Independent of the card selection.
  const handleSelectToken = (character) => {
    // Same ownership guard as handleSelectCharacter — FightArea already screens this, but keep
    // it here too (defense in depth, matches the existing double-guard pattern).
    if (gameId && token && !isGM && !isOwnCharacter(character.id)) {
      return;
    }
    // Clicking the already-active token toggles it off (same UX as the card toggle).
    setActiveTokenId(prev => (prev === character.id ? null : character.id));
    setSelectedImageTokenId(null); // one ring open at a time
  };

  // Select an image-token (tokens-layer scene image). Toggles off when re-clicked, and clears any
  // active character token so only one ring is open at once.
  const handleSelectImageToken = useCallback((imageId) => {
    setSelectedImageTokenId(prev => (prev === imageId ? null : imageId));
    setActiveTokenId(null);
  }, []);

  // Clear any expanded ring — fired when clicking anywhere on the map outside a token
  // (background image, empty grid). Own-token clicks stopPropagation in FightArea, so
  // activating a token doesn't immediately clear it.
  const clearActiveToken = useCallback(() => {
    setActiveTokenId(null);
    setSelectedImageTokenId(null);
  }, []);

  // Multiplayer: Add character to grid (scene-aware)
  const handleAddCharacterToGrid = async (characterId, positionX, positionY, isEnemy) => {
    if (!gameId || !token) return;

    const sid = sceneIdRef.current;
    const url = sid
      ? `${getApiUrl()}/games/${gameId}/scenes/${sid}/characters`
      : `${getApiUrl()}/games/${gameId}/characters`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: getApiHeaders({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }),
        body: JSON.stringify({
          characterId,
          positionX,
          positionY,
          isEnemy
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add character');
      }

      // Success - WebSocket will handle the update
    } catch (error) {
      console.error('Error adding character to grid:', error);
      addLogMessage('Failed to add character to grid', 'error');
    }
  };

  // Multiplayer: Move character on grid (scene-aware)
  const handleMoveCharacter = async (characterId, positionX, positionY) => {
    if (!gameId || !token) return;

    const sid = sceneIdRef.current;
    // Scene tokens use the unified geometry endpoint (charId in path, partial body); the legacy
    // top-level grid still posts to /characters/move with the id in the body.
    const url = sid
      ? `${getApiUrl()}/games/${gameId}/scenes/${sid}/characters/${characterId}`
      : `${getApiUrl()}/games/${gameId}/characters/move`;
    const body = sid
      ? { positionX, positionY }
      : { characterId, positionX, positionY };

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: getApiHeaders({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }),
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to move character');
      }

      // Success - WebSocket will handle the update
    } catch (error) {
      console.error('Error moving character:', error);
      addLogMessage('Failed to move character', 'error');
    }
  };

  // Commit a character move from the unified tokens layer (MapCharacterToken drag). Mirrors the
  // old dnd-kit drop: optimistic fightZones update + REST. Snap mode keeps one token per cell.
  const handleCommitCharacterMove = (characterId, col, row) => {
    const zones = fightZonesRef.current;
    const zoneId = `zone-${row}-${col}`;
    const targetIdx = zones.findIndex(z => z.id === zoneId);
    const currentIdx = zones.findIndex(z => z.character?.id === characterId);
    if (targetIdx === -1 || currentIdx === targetIdx) return;
    const targetChar = zones[targetIdx].character;
    if (targetChar && targetChar.id !== characterId) {
      addLogMessage('Cell already occupied', 'warning');
      return; // token snaps back on next prop sync
    }
    const draggedChar = currentIdx !== -1 ? zones[currentIdx].character : resolveCharacter(characterId);
    setFightZones(prev => prev.map((zone, idx) => {
      if (idx === currentIdx) return { ...zone, character: null };
      if (idx === targetIdx) return { ...zone, character: draggedChar };
      return zone;
    }));
    handleMoveCharacter(characterId, col, row);
  };

  // Commit a character resize (and any position shift from N/W handles) to the geometry endpoint.
  const handleResizeCharacter = async (characterId, w, h, col, row) => {
    if (!gameId || !token) return;
    const sid = sceneIdRef.current;
    if (!sid) return;
    setCharGeomOverride(prev => ({ ...prev, [characterId]: { w, h } })); // optimistic; survives remount
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/scenes/${sid}/characters/${characterId}`, {
        method: 'PUT',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ positionX: col, positionY: row, w, h }),
      });
    } catch (error) {
      console.error('Error resizing character:', error);
    }
  };

  // Multiplayer: Remove character from grid (scene-aware)
  const handleRemoveCharacter = async (characterId) => {
    if (!gameId || !token) return;

    const sid = sceneIdRef.current;
    const url = sid
      ? `${getApiUrl()}/games/${gameId}/scenes/${sid}/characters/${characterId}`
      : `${getApiUrl()}/games/${gameId}/characters/${characterId}`;

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: getApiHeaders({
          'Authorization': `Bearer ${token}`
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove character');
      }

      // Success - WebSocket will handle the update
    } catch (error) {
      console.error('Error removing character from grid:', error);
      addLogMessage('Failed to remove character from grid', 'error');
    }
  };

  const fetchCharacters = useCallback(async (silent = false) => {
    if (!gameId || !token) {
      if (!silent) setIsLoading(false);
      return;
    }
    try {
      if (!silent) setIsLoading(true);

      const res = await fetch(`${getApiUrl()}/games/${gameId}/characters`, {
        headers: getApiHeaders({
          'Authorization': `Bearer ${token}`
        })
      });
      if (!res.ok) throw new Error('Failed to fetch characters');
      const rawData = await res.json();
      const charactersData = rawData.map(normalizeCharacter);

      setInitialCharacters(charactersData);

      // Update selected character with fresh data, or clear if access was revoked
      setSelectedCharacter(prev => {
        if (!prev) return prev;
        const fresh = charactersData.find(c => c.id === prev.id);
        return fresh || null;
      });

      // Filter out characters currently on the grid
      setCharacters(() => {
        if (!fightZonesRef.current || !Array.isArray(fightZonesRef.current)) {
          return charactersData;
        }

        const characterIdsOnGrid = new Set(
          fightZonesRef.current
            .filter(zone => zone.character)
            .map(zone => zone.character.id)
        );

        return charactersData.filter(
          char => !characterIdsOnGrid.has(char.id)
        );
      });

      setError(null);
    } catch (e) {
      console.error(e);
      if (!silent) setError('Nie udało się pobrać postaci.');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [gameId, token]);

  // Handle adding a new character - creates minimal character and opens sheet for editing
  const handleAddCharacter = useCallback(async () => {
    try {
      // Create minimal character with required structure
      const newCharacter = {
        name: t('character.newCharacter'),
        stats: {
          basicInfo: {
            name: t('character.newCharacter'),
            type: 'ally',
            species: '',
            career: '',
            careerLevel: '',
            status: '',
            careerPath: '',
            class: '',
            age: '',
            height: '',
            hair: '',
            eyes: '',
            avatar: ''
          },
          characteristics: {
            initial: { WS: 0, BS: 0, S: 0, T: 0, I: 0, Ag: 0, Dex: 0, Int: 0, WP: 0, Fel: 0 },
            advances: { WS: 0, BS: 0, S: 0, T: 0, I: 0, Ag: 0, Dex: 0, Int: 0, WP: 0, Fel: 0 },
            current: { WS: 0, BS: 0, S: 0, T: 0, I: 0, Ag: 0, Dex: 0, Int: 0, WP: 0, Fel: 0 }
          },
          basicSkills: {},
          advancedSkills: {},
          weapons: [],
          talents: []
        }
      };

      const res = await fetch(`${getApiUrl()}/games/${gameId}/characters`, {
        method: 'POST',
        headers: getApiHeaders({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }),
        body: JSON.stringify(newCharacter)
      });
      if (!res.ok) throw new Error('Failed to create character');
      const createdCharacter = normalizeCharacter(await res.json());

      await fetchCharacters(true);
      setPcListCollapsed(false);
      setSelectedCharacter(createdCharacter);
      openCharacterSheet(createdCharacter.id);
    } catch (err) {
      console.error('Failed to create character:', err);
      addLogMessage(t('character.createError'), 'error');
    }
  }, [gameId, token, fetchCharacters, addLogMessage, t, openCharacterSheet]);

  const handleAddNPC = useCallback(async () => {
    try {
      const newCharacter = {
        name: t('character.newCharacter'),
        isNPC: true,
        stats: {
          basicInfo: {
            name: t('character.newCharacter'),
            type: 'enemy',
            species: '',
            career: '',
            careerLevel: '',
            status: '',
            careerPath: '',
            class: '',
            age: '',
            height: '',
            hair: '',
            eyes: '',
            avatar: ''
          },
          characteristics: {
            initial: { WS: 0, BS: 0, S: 0, T: 0, I: 0, Ag: 0, Dex: 0, Int: 0, WP: 0, Fel: 0 },
            advances: { WS: 0, BS: 0, S: 0, T: 0, I: 0, Ag: 0, Dex: 0, Int: 0, WP: 0, Fel: 0 },
            current: { WS: 0, BS: 0, S: 0, T: 0, I: 0, Ag: 0, Dex: 0, Int: 0, WP: 0, Fel: 0 }
          },
          basicSkills: {},
          advancedSkills: {},
          weapons: [],
          talents: []
        }
      };

      const res = await fetch(`${getApiUrl()}/games/${gameId}/characters`, {
        method: 'POST',
        headers: getApiHeaders({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }),
        body: JSON.stringify(newCharacter)
      });
      if (!res.ok) throw new Error('Failed to create NPC');
      const createdCharacter = normalizeCharacter(await res.json());

      await fetchCharacters(true);
      setNpcListCollapsed(false);
      setSelectedCharacter(createdCharacter);
      openCharacterSheet(createdCharacter.id);
    } catch (err) {
      console.error('Failed to create NPC:', err);
      addLogMessage(t('character.createError'), 'error');
    }
  }, [gameId, token, fetchCharacters, addLogMessage, t, openCharacterSheet]);

  const handleCloneCharacter = useCallback(async (count) => {
    if (!cloneTarget || !gameId) return;
    try {
      const res = await fetch(
        `${getApiUrl()}/games/${gameId}/characters/${cloneTarget.id}/clone`,
        {
          method: 'POST',
          headers: getApiHeaders({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }),
          body: JSON.stringify({ count })
        }
      );
      if (!res.ok) throw new Error('Failed to clone character');
      await fetchCharacters(true);
      setCloneTarget(null);
    } catch (err) {
      console.error('Failed to clone character:', err);
      addLogMessage(t('character.cloneError'), 'error');
    }
  }, [cloneTarget, gameId, token, fetchCharacters, addLogMessage, t]);

  const handleDeleteCharacter = useCallback(async () => {
    if (!deleteTarget || !gameId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(
        `${getApiUrl()}/games/${gameId}/characters/${deleteTarget.id}`,
        {
          method: 'DELETE',
          headers: getApiHeaders({ 'Authorization': `Bearer ${token}` })
        }
      );
      if (!res.ok) throw new Error('Failed to delete character');
      setDeleteTarget(null);
      await fetchCharacters(true);
      setSelectedCharacter(prev => prev?.id === deleteTarget.id ? null : prev);
    } catch (err) {
      console.error('Failed to delete character:', err);
      addLogMessage(t('character.deleteError'), 'error');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, gameId, token, fetchCharacters, addLogMessage, t]);

  const handleCharacterUpdate = (updatedCharacter) => {
    // Update local state only - saving is handled by the component making the changes

    // Update in initialCharacters
    setInitialCharacters(prev => {
      if (!prev || !Array.isArray(prev)) return [];
      return prev.map(char => char.id === updatedCharacter.id ? updatedCharacter : char);
    });

    // Update in available characters pool
    setCharacters(prev => {
      if (!prev || !Array.isArray(prev)) return [];
      return prev.map(char => char.id === updatedCharacter.id ? updatedCharacter : char);
    });

    // Update in fight zones if character is on grid
    setFightZones(prev =>
      prev.map(zone => {
        if (zone.character?.id === updatedCharacter.id) {
          return { ...zone, character: updatedCharacter };
        }
        return zone;
      })
    );

    // Update selectedCharacter if it's the one being updated
    setSelectedCharacter(prev => {
      if (prev?.id === updatedCharacter.id) {
        return updatedCharacter;
      }
      return prev;
    });
  };

  // Fetch game state and populate characters on grid (multiplayer mode, scene-aware)
  const fetchGameCharacters = useCallback(async () => {
    if (!gameId || !token) return;

    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}`, {
        headers: getApiHeaders({
          'Authorization': `Bearer ${token}`
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch game state');
      }

      const game = await response.json();

      // Find the current scene's characters
      let sceneCharacters = game.characters || [];
      if (game.scenes && game.scenes.length > 0 && sceneId) {
        const scene = game.scenes.find(s => s.id === sceneId);
        if (scene) {
          sceneCharacters = scene.characters || [];
        }
      }

      console.log('Scene characters loaded:', sceneCharacters);

      // Reset fight zones first with current dimensions
      const clearedZones = generateFightZones(gridWidth, gridHeight);

      // Populate fight zones with characters from the scene
      if (sceneCharacters.length > 0) {
        // Get all game character data
        const allCharsResponse = await fetch(`${getApiUrl()}/games/${gameId}/characters`, {
          headers: getApiHeaders({ 'Authorization': `Bearer ${token}` })
        });
        const allCharacters = allCharsResponse.ok ? await allCharsResponse.json() : [];

        // Track which character IDs are on the grid
        const characterIdsOnGrid = new Set();

        sceneCharacters.forEach(gameChar => {
          // positionX is col, positionY is row
          const zoneIndex = clearedZones.findIndex(
            z => z.col === gameChar.positionX && z.row === gameChar.positionY
          );
          if (zoneIndex !== -1) {
            const fullChar = allCharacters.find(c => c.id === gameChar.characterId);
            // Use full character data if accessible; otherwise fall back to scene token data
            const charData = fullChar
              ? normalizeCharacter(fullChar)
              : { id: gameChar.characterId, name: gameChar.name, avatar: gameChar.avatar, isEnemy: gameChar.isEnemy, stats: {}, gridOnly: true };
            clearedZones[zoneIndex] = { ...clearedZones[zoneIndex], character: charData };
            characterIdsOnGrid.add(gameChar.characterId);
          }
        });

        // Update fight zones
        setFightZones(clearedZones);

        // Remove characters that are on the grid from the available pool
        setCharacters(prev => {
          if (!prev || prev.length === 0) return [];
          return prev.filter(c => !characterIdsOnGrid.has(c.id));
        });
      } else {
        // No characters on grid, reset zones
        setFightZones(clearedZones);
      }
    } catch (error) {
      console.error('Error fetching game characters:', error);
    }
  }, [gameId, token, sceneId, gridWidth, gridHeight]);

  useEffect(() => {
    // Only run initial load once
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const init = async () => {
      await fetchCharacters();
      // After characters are loaded, fetch game characters if in multiplayer mode
      if (gameId && token) {
        fetchGameCharacters();
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Grid placement changed — refetch positions
  useEffect(() => {
    if (gameId && token && characterUpdateTrigger > 0) {
      fetchGameCharacters();
    }
  }, [characterUpdateTrigger, fetchGameCharacters, gameId, token]);

  // Character data changed (sheet edit, visibility, token state/HP/overlay) — silent
  // refetch. fetchCharacters refreshes the available pool; fetchGameCharacters refreshes
  // the tokens on the grid (fightZones) — the token overlay reads from there, so both
  // must run or on-map state/HP edits look stale until the next placement change.
  useEffect(() => {
    if (gameId && token && characterDataTrigger > 0) {
      fetchCharacters(true);
      fetchGameCharacters();
    }
  }, [characterDataTrigger, fetchCharacters, fetchGameCharacters, gameId, token]);

  // Selected drawing path (for select/delete tool)
  const [selectedDrawingPathId, setSelectedDrawingPathId] = useState(null);

  // Clear selection when the selected path is removed by any user
  useEffect(() => {
    if (!selectedDrawingPathId) return;
    const paths = currentScene?.drawingPaths || [];
    if (!paths.find(p => p.id === selectedDrawingPathId)) {
      setSelectedDrawingPathId(null);
    }
  }, [currentScene?.drawingPaths, selectedDrawingPathId]);

  // Clear selection when switching away from select tool
  useEffect(() => {
    if (activeTool !== 'select') setSelectedDrawingPathId(null);
  }, [activeTool]);

  // Drawing undo/clear handlers
  const handleUndoDrawing = useCallback(async () => {
    if (!gameId || !currentSceneId) return;
    try {
      await undoLastDrawingPath(gameId, currentSceneId);
    } catch (err) {
      console.error('Failed to undo drawing path:', err);
    }
  }, [gameId, currentSceneId]);

  const handleClearDrawing = useCallback(async () => {
    if (!gameId || !currentSceneId) return;
    try {
      await clearDrawingPaths(gameId, currentSceneId);
    } catch (err) {
      console.error('Failed to clear drawing paths:', err);
    }
  }, [gameId, currentSceneId]);

  // Fog undo/clear handlers (for the unified toolbar in fog mode)
  const handleUndoFog = useCallback(async () => {
    if (!gameId || !currentSceneId) return;
    try {
      await undoLastFogPath(gameId, currentSceneId);
    } catch (err) {
      console.error('Failed to undo fog path:', err);
    }
  }, [gameId, currentSceneId]);

  const handleClearFog = useCallback(async () => {
    if (!gameId || !currentSceneId) return;
    try {
      await clearFogPaths(gameId, currentSceneId);
    } catch (err) {
      console.error('Failed to clear fog paths:', err);
    }
  }, [gameId, currentSceneId]);

  const handleRevealAllFog = useCallback(async () => {
    if (!gameId || !currentSceneId) return;
    try {
      await revealAllFog(gameId, currentSceneId);
    } catch (err) {
      console.error('Failed to reveal all fog:', err);
    }
  }, [gameId, currentSceneId]);

  // Delete the currently selected drawing path
  const handleDeleteSelectedDrawing = useCallback(async (pathId) => {
    const id = pathId || selectedDrawingPathId;
    if (!gameId || !currentSceneId || !id) return;
    try {
      await deleteDrawingPath(gameId, currentSceneId, id);
      setSelectedDrawingPathId(null);
      // WS DRAWING_PATH_REMOVED will update game state
    } catch (err) {
      console.error('Failed to delete drawing path:', err);
    }
  }, [gameId, currentSceneId, selectedDrawingPathId]);



  // Toggle character on/off grid from the sidebar list
  const handleGridToggle = useCallback(async (char) => {
    const zones = fightZonesRef.current;
    const onGrid = zones.some(z => z.character?.id === char.id);
    if (onGrid) {
      if (gameId && token) {
        await handleRemoveCharacter(char.id);
      } else {
        setFightZones(prev => prev.map(z => z.character?.id === char.id ? { ...z, character: null } : z));
      }
    } else {
      const emptyZoneIndex = zones.findIndex(z => !z.character);
      if (emptyZoneIndex !== -1) {
        const targetZone = zones[emptyZoneIndex];
        if (gameId && token) {
          await handleAddCharacterToGrid(char.id, targetZone.col, targetZone.row, false);
        } else {
          setFightZones(prev => prev.map((z, idx) => idx === emptyZoneIndex ? { ...z, character: char } : z));
        }
      } else {
        addLogMessage('No empty spaces on grid', 'warning');
      }
    }
  }, [gameId, token, addLogMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <div>Ładowanie postaci...</div>;
  if (error) return <div style={{color:'red', padding:20}}>{error} <button onClick={fetchCharacters}>Odśwież</button></div>;

  // FEATURE-102: token-display layout comes from the game's embedded system template
  // (set for custom games and for hardcoded games created from a named variant).
  const tokenDisplay = game?.customSystemTemplate?.settings?.tokenDisplay || null;

  // Other players' rulers on this scene (manual tool + broadcast drag rulers).
  const sceneRulers = Object.values(mapRulers).filter(r => r.sceneId === currentSceneId);
  const dragRuler = imageDragRuler;

  // Placed character tokens for the unified layer: cell from fightZones, size/z-index from the
  // scene character (defaults 1×1 for pre-w/h data), drag gated by ownership.
  const isMultiplayer = !!(gameId && token);
  const sceneChars = currentScene?.characters || [];
  const placedCharacters = fightZones
    .filter(z => z.character)
    .map(z => {
      const sc = sceneChars.find(c => c.characterId === z.character.id);
      const ov = charGeomOverride[z.character.id];
      return {
        character: z.character,
        col: z.col,
        row: z.row,
        w: ov?.w ?? ((sc && sc.w) || 1),
        h: ov?.h ?? ((sc && sc.h) || 1),
        zIndex: (sc && sc.zIndex) || 0,
        canDrag: !isMultiplayer || isGM || isOwnCharacter(z.character.id),
      };
    });

  return (
    <>
      <div className="dnd-context">
        {/* Left Sidebar with Toggle */}
        <div className="left-sidebar-wrapper">
          <div className={`left-sidebar ${isHidden ? 'left-sidebar--hidden' : ''}`}>
            {/* Sidebar Header */}
            <header className="panel-header">
              <h2 className="panel-header__title">{t('leftPanel.title')}</h2>
            </header>
            <ResizableSplitPane
              top={
                <CharacterDetailsPanel
                  character={selectedCharacter}
                  onCharacterUpdate={handleCharacterUpdate}
                  addLogMessage={addLogMessage}
                  gameId={gameId}
                  token={token}
                  isGM={isGM}
                  gameSystem={gameSystem}
                  onOpenCharacterSheet={openCharacterSheet}
                  rollVisibility={rollVisibility}
                  game={game}
                />
              }
              bottom={
                <CharacterSidebarList
                  initialCharacters={initialCharacters}
                  isGM={isGM}
                  userId={userId}
                  participants={participants}
                  selectedCharacter={selectedCharacter}
                  fightZones={fightZones}
                  pcListCollapsed={pcListCollapsed}
                  npcListCollapsed={npcListCollapsed}
                  onPCCollapseToggle={() => setPcListCollapsed(v => !v)}
                  onNPCCollapseToggle={() => setNpcListCollapsed(v => !v)}
                  characterTileRefs={characterTileRefs}
                  onSelect={handleSelectCharacter}
                  onGridToggle={handleGridToggle}
                  onAddCharacter={handleAddCharacter}
                  onAddNPC={handleAddNPC}
                  onClone={setCloneTarget}
                  onVisibility={setVisibilityTarget}
                  onDelete={setDeleteTarget}
                  gameId={gameId}
                />
              }
            />
          </div>
          {/* Left Panel Toggle */}
          <button
            className={`panel-toggle panel-toggle--left ${isHidden ? 'panel-toggle--hidden' : ''}`}
            onClick={onTogglePanel}
            title={isHidden ? 'Show Panel' : 'Hide Panel'}
          >
            <span className="panel-toggle__arrow">{isHidden ? '▶' : '◀'}</span>
          </button>
        </div>

        <div className="fight-grid-wrapper" style={{ position: 'relative' }}>
          {sceneSelector}
          <OnlineUsersBar
            game={game}
            participants={participants}
            onlineUserIds={onlineUserIds}
            bubbleSize={(participants.find(p => p.userId === userId) || {}).avatarSize || 'small'}
            showSignature={!!(participants.find(p => p.userId === userId) || {}).showSignature}
            currentUserId={userId}
            onOpenPlayerSettings={() => setPlayerSettingsOpen(true)}
          />
          <PlayerSettingsPopup
            isOpen={playerSettingsOpen}
            onClose={() => setPlayerSettingsOpen(false)}
            gameId={gameId}
            participants={participants}
            onParticipantUpdated={onParticipantUpdated}
          />
          {/* Drawing toolbar — floats over the scene, visible to all */}
          {currentScene && (
            <DrawingToolbar
              editingLayer={editingLayer}
              onEditingLayerChange={onEditingLayerChange}
              imageEditLayer={imageEditLayer}
              onImageEditLayerChange={onImageEditLayerChange}
              fogCoverMode={fogCoverMode}
              onFogCoverModeChange={onFogCoverModeChange}
              aoeEnabled={aoeMeasure}
              onAoeToggle={() => setAoeMeasure(v => !v)}
              activeTool={activeTool}
              onActiveToolChange={onActiveToolChange}
              brushSize={brushSize}
              onBrushSizeChange={onBrushSizeChange}
              drawingColor={drawingColor}
              onDrawingColorChange={onDrawingColorChange}
              drawingFontSize={drawingFontSize}
              onDrawingFontSizeChange={onDrawingFontSizeChange}
              onUndoDrawing={handleUndoDrawing}
              onClearDrawing={handleClearDrawing}
              onUndoFog={handleUndoFog}
              onClearFog={handleClearFog}
              onRevealAllFog={handleRevealAllFog}
              selectedPathId={selectedDrawingPathId}
              onDeleteSelected={handleDeleteSelectedDrawing}
              isGM={isGM}
              canUndo={(currentScene?.drawingPaths || []).length > 0}
              canUndoFog={(currentScene?.revealPaths || []).length > 0}
            />
          )}

          {/* Fight Grid with Scene Layers */}
          <SceneViewport scene={currentScene} isGM={isGM} gameId={gameId} editingLayer={editingLayer} imageEditLayer={imageEditLayer} gridWidth={gridWidth} gridHeight={gridHeight} onZoomChange={setViewportZoom} sendMessage={sendMessage} pointerPings={pointerPings} onRemovePing={onRemovePing} brushSize={brushSize} activeTool={activeTool} fogCoverMode={fogCoverMode} onFogPathComplete={onFogPathComplete} drawingColor={drawingColor} drawingFontSize={drawingFontSize} onDrawingPathComplete={onDrawingPathComplete} selectedPathId={selectedDrawingPathId} onSelectionChange={setSelectedDrawingPathId} onDeletePath={handleDeleteSelectedDrawing} controlScheme={controlScheme} onBackgroundClick={clearActiveToken} selectedImageTokenId={selectedImageTokenId} onSelectImageToken={handleSelectImageToken} gameSystem={gameSystem} tokenPlacementMode={tokenPlacementMode} userId={userId} userName={userName} measurementMetric={measurementMetric} cellDistance={cellDistance} distanceUnit={distanceUnit} mapRulers={sceneRulers} dragRuler={dragRuler} onTokenDragMeasureStart={handleTokenDragMeasureStart} onTokenDragMeasureMove={handleTokenDragMeasureMove} onTokenDragMeasureEnd={handleTokenDragMeasureEnd} aoeEnabled={aoeMeasure} placedCharacters={placedCharacters} isMultiplayer={isMultiplayer} tokenDisplay={tokenDisplay} token={token} activeTokenId={activeTokenId} onSelectCharacter={handleSelectToken} onCommitMove={handleCommitCharacterMove} onCommitResize={handleResizeCharacter} />
        </div>
      </div>

      {/* Otwarte karty postaci (multi-open) */}
      <CharacterSheetHost
        openCharacterIds={openCharacterIds}
        resolveCharacter={resolveCharacter}
        onClose={closeCharacterSheet}
        onCharacterUpdate={handleCharacterUpdate}
        addLogMessage={addLogMessage}
        gameId={gameId}
        token={token}
        isGM={isGM}
        gameSystem={gameSystem}
        rollVisibility={rollVisibility}
        game={game}
      />

      {/* Clone Character Modal */}
      {cloneTarget && (
        <CloneCharacterModal
          character={cloneTarget}
          onConfirm={handleCloneCharacter}
          onCancel={() => setCloneTarget(null)}
        />
      )}

      {/* Character Visibility Modal (GM only) */}
      {visibilityTarget && (
        <CharacterVisibilityModal
          character={visibilityTarget}
          participants={participants}
          gameId={gameId}
          token={token}
          onClose={() => setVisibilityTarget(null)}
        />
      )}

      {/* Delete Character Confirm Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        message={t('character.confirmDeleteCharacter', { name: deleteTarget?.basicInfo?.name || deleteTarget?.name || '' })}
        onConfirm={handleDeleteCharacter}
        onCancel={() => setDeleteTarget(null)}
        isLoading={isDeleting}
      />

    </>
  );
}

export default DragAndDropContext;