import React, {useCallback, useEffect, useRef, useState} from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl, getApiHeaders } from '../api/axios';
import CharacterDetailsPanel from './CharacterDetailsPanel';
import CloneCharacterModal from './CloneCharacterModal';
import CharacterVisibilityModal from './CharacterVisibilityModal';
import SceneViewport from './scene/SceneViewport';
import DrawingToolbar from './scene/DrawingToolbar';
import LayerSelector from './scene/LayerSelector';
import OnlineUsersBar from './online-users/OnlineUsersBar';
import PlayerSettingsPopup from './online-users/PlayerSettingsPopup';
import { undoLastDrawingPath, clearDrawingPaths, undoLastFogPath, clearFogPaths, revealAllFog, deleteDrawingPath, deleteSceneImage, updateSceneImage, batchMoveTokens } from '../api/scenes';
import ConfirmModal from './common/ConfirmModal';
import ResizableSplitPane from './common/ResizableSplitPane';
import CharacterSidebarList from './CharacterSidebarList';
import CharacterSheetHost from './CharacterSheetHost';
import { normalizeCharacter } from '../systems/registry';
import { resolveDisplayName } from '../utils/participants';
import { buildPlacedCharacters } from '../utils/placedCharacters';
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


function DragAndDropContext({ addLogMessage, gameId = null, token = null, gameSystem = 'warhammer4e', characterUpdateTrigger = 0, characterDataTrigger = 0, isHidden = false, onTogglePanel, currentScene = null, isGM = false, userId = null, participants = [], editingLayer = null, onEditingLayerChange, imageEditLayer = 'background', onImageEditLayerChange, fogCoverMode = false, onFogCoverModeChange, sendMessage = null, pointerPings = [], onRemovePing, mapRulers = {}, onFogPathComplete, activeTool = 'freehand', onActiveToolChange, brushSize = 10, onBrushSizeChange, drawingColor = '#ff0000', onDrawingColorChange, drawingFontSize = 16, onDrawingFontSizeChange, onDrawingPathComplete, onDeleteDrawingPath, currentSceneId = null, sceneSelector = null, rollVisibility = 'all', game = null, onlineUserIds = [], onParticipantUpdated, controlScheme = 'modern' }) {
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
  const [selectedImageId, setSelectedImageId] = useState(null);

  // Multi-select (Select mode): list of {kind:'image'|'char', id}. Local GM-only UI state.
  const [selectedTokens, setSelectedTokens] = useState([]);

  // Clear selection when the selected image is removed by any user (WS delete).
  // Mirrors the drawing-path cleanup below.
  useEffect(() => {
    if (!selectedImageId) return;
    const images = currentScene?.images || [];
    if (!images.find(i => i.id === selectedImageId)) {
      setSelectedImageId(null);
    }
  }, [currentScene?.images, selectedImageId]);

  // Drop the selection when leaving the context where images are selectable (same gate as
  // SceneImage.handleClick: default or pan). Without this a stale selection stays deletable from
  // Fog/Measure/Images/Drawing modes. Mirrors the selectedDrawingPathId clear on tool change.
  useEffect(() => {
    if (!(editingLayer === null || activeTool === 'pan')) setSelectedImageId(null);
  }, [editingLayer, activeTool]);

  // Leaving Select mode drops the multi-selection.
  useEffect(() => {
    if (editingLayer !== 'select') setSelectedTokens([]);
  }, [editingLayer]);

  // Switching the armed layer changes what's selectable, so reset the selection — otherwise a
  // token picked on the old layer lingers and turns a single-layer selection into a "mixed" one,
  // which collapses the group menu to the remove-only intersection.
  useEffect(() => {
    setSelectedTokens([]);
  }, [imageEditLayer]);

  // Drop tokens that no longer exist (deleted by any user / scene switch).
  useEffect(() => {
    if (!selectedTokens.length) return;
    const imgIds = new Set((currentScene?.images || []).map(i => i.id));
    const charIds = new Set((currentScene?.characters || []).map(c => c.characterId));
    setSelectedTokens(prev => {
      const next = prev.filter(t => (t.kind === 'image' ? imgIds.has(t.id) : charIds.has(t.id)));
      return next.length === prev.length ? prev : next;
    });
  }, [currentScene?.images, currentScene?.characters, selectedTokens.length]);

  // Escape clears the multi-selection while in Select mode.
  useEffect(() => {
    if (editingLayer !== 'select') return;
    const onKey = (e) => { if (e.key === 'Escape') setSelectedTokens([]); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingLayer]);

  // Delete / Backspace removes the selected image (GM). Locked images are skipped.
  // Ignored while typing in a field. Mirrors DrawingLayer's keyboard delete.
  useEffect(() => {
    if (!selectedImageId) return;
    const handleKeyDown = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const img = (currentScene?.images || []).find(i => i.id === selectedImageId);
      if (!img || img.locked) return;
      deleteSceneImage(gameId, currentSceneId, selectedImageId)
        .then(() => setSelectedImageId(null))
        .catch(err => console.error('Failed to delete scene image:', err));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImageId, currentScene?.images, gameId, currentSceneId]);

  // Delete / Backspace in Select mode removes all selected tokens (images deleted, characters
  // removed from grid). Skips locked images. Ignored while typing.
  useEffect(() => {
    if (editingLayer !== 'select' || !selectedTokens.length) return;
    const handleKeyDown = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const images = currentScene?.images || [];
      selectedTokens.forEach(t => {
        if (t.kind === 'image') {
          const img = images.find(i => i.id === t.id);
          if (img && !img.locked) deleteSceneImage(gameId, currentSceneId, t.id).catch(err => console.error(err));
        } else {
          handleRemoveCharacter(t.id);
        }
      });
      setSelectedTokens([]);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingLayer, selectedTokens, currentScene?.images, gameId, currentSceneId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group actions — loop existing per-token endpoints (infrequent one-shot clicks).
  const groupImages = useCallback(
    () => selectedTokens.filter(t => t.kind === 'image')
      .map(t => (currentScene?.images || []).find(i => i.id === t.id)).filter(Boolean),
    [selectedTokens, currentScene?.images]
  );

  const handleGroupDelete = useCallback(() => {
    const sid = sceneIdRef.current;
    selectedTokens.forEach(t => {
      if (t.kind === 'image') {
        const img = (currentScene?.images || []).find(i => i.id === t.id);
        if (img && !img.locked) deleteSceneImage(gameId, sid, t.id).catch(e => console.error(e));
      } else {
        handleRemoveCharacter(t.id);
      }
    });
    setSelectedTokens([]);
  }, [selectedTokens, currentScene?.images, gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGroupSetLock = useCallback((locked) => {
    const sid = sceneIdRef.current;
    groupImages().forEach(img => updateSceneImage(gameId, sid, img.id, { locked }).catch(e => console.error(e)));
  }, [groupImages, gameId]);

  const handleGroupSetLayer = useCallback((layer) => {
    const sid = sceneIdRef.current;
    groupImages().forEach(img => updateSceneImage(gameId, sid, img.id, { layer }).catch(e => console.error(e)));
    setSelectedTokens([]);
  }, [groupImages, gameId]);

  // Resets both token kinds — characters gained rotation in FEATURE-152, and leaving them out
  // would make the "reset all" menu entry lie about what it touched.
  const handleGroupResetRotation = useCallback(() => {
    const sid = sceneIdRef.current;
    groupImages().forEach(img => updateSceneImage(gameId, sid, img.id, { rotation: 0 }).catch(e => console.error(e)));
    selectedTokens
      .filter(t => t.kind === 'char')
      .forEach(t => handleRotateCharacter(t.id, 0));
  }, [groupImages, gameId, selectedTokens]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Clear the active token when its character leaves the scene for any reason
  // (grid-toggle off, drag back to the pool, delete, scene switch, WS refetch).
  // Mirrors the selectedDrawingPathId cleanup pattern below.
  // Asks the scene's placements, not fightZones: the token layer renders from the placements now,
  // and a token missing from the whole-cell grid (two free-mode tokens rounding into one cell)
  // would otherwise be deselected the instant it was selected.
  useEffect(() => {
    if (!activeTokenId || !currentScene) return;
    const onScene = (currentScene.characters || []).some(c => c.characterId === activeTokenId);
    if (!onScene) setActiveTokenId(null);
  }, [currentScene, activeTokenId]);

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
    setSelectedImageId(null); // one ring open at a time
  };

  // Select an image-token (tokens-layer scene image). Toggles off when re-clicked, and clears any
  // active character token so only one ring is open at once.
  const handleSelectImage = useCallback((imageId) => {
    setSelectedImageId(prev => (prev === imageId ? null : imageId));
    setActiveTokenId(null);
  }, []);

  const isTokenSelected = useCallback(
    (kind, id) => selectedTokens.some(t => t.kind === kind && t.id === id),
    [selectedTokens]
  );

  // Marquee result. additive (Shift) merges (dedup); otherwise replaces.
  const handleMarqueeSelect = useCallback((picked, additive) => {
    setSelectedTokens(prev => {
      if (!additive) return picked;
      const seen = new Set(prev.map(t => `${t.kind}:${t.id}`));
      return [...prev, ...picked.filter(t => !seen.has(`${t.kind}:${t.id}`))];
    });
  }, []);

  // Click / Shift-click on a token. additive toggles membership; plain click replaces with just it.
  const toggleTokenSelected = useCallback((kind, id, additive) => {
    setSelectedTokens(prev => {
      const key = `${kind}:${id}`;
      const has = prev.some(t => `${t.kind}:${t.id}` === key);
      if (additive) return has ? prev.filter(t => `${t.kind}:${t.id}` !== key) : [...prev, { kind, id }];
      return [{ kind, id }];
    });
  }, []);

  // Clear any expanded ring — fired when clicking anywhere on the map outside a token
  // (background image, empty grid). Own-token clicks stopPropagation in FightArea, so
  // activating a token doesn't immediately clear it.
  const clearActiveToken = useCallback(() => {
    setActiveTokenId(null);
    setSelectedImageId(null);
  }, []);

  // Multiplayer: Add character to grid (scene-aware)
  const handleAddCharacterToGrid = async (characterId, positionX, positionY, isEnemy) => {
    if (!gameId || !token) return;

    const sid = sceneIdRef.current;
    if (!sid) return; // placements are scene-scoped; no scene → nothing to place onto

    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}/scenes/${sid}/characters`, {
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
    if (!sid) return; // placements are scene-scoped

    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}/scenes/${sid}/characters/${characterId}`, {
        method: 'PUT',
        headers: getApiHeaders({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }),
        body: JSON.stringify({ positionX, positionY })
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
  // Commit a character token move. Snap mode enforces one token per cell and mirrors the move into
  // fightZones (which the sidebar and the occupancy rule still read). Free mode has no cell to
  // occupy — positions are fractional — so it persists straight away. Gating the whole function on
  // a `zone-${row}-${col}` lookup meant a fractional position matched no zone and the move was
  // silently dropped before it ever reached the server.
  const handleCommitCharacterMove = (characterId, col, row) => {
    if (tokenPlacementMode === 'snap') {
      const zones = fightZonesRef.current;
      const targetIdx = zones.findIndex(z => z.id === `zone-${row}-${col}`);
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
    }
    handleMoveCharacter(characterId, col, row);
  };

  // Persist a group drag in one batch call. moves = { images:[{id,x,y}], characters:[{id,positionX,positionY}] }.
  const handleCommitGroupMove = useCallback(async (moves) => {
    const sid = sceneIdRef.current;
    if (!sid) return;
    try {
      await batchMoveTokens(gameId, sid, moves);
    } catch (err) {
      console.error('Failed to batch move tokens:', err);
      addLogMessage('Failed to move tokens', 'error');
    }
  }, [gameId, addLogMessage]);

  // Commit a character resize (and any position shift from N/W handles) to the geometry endpoint.
  const handleResizeCharacter = async (characterId, w, h, col, row) => {
    if (!gameId || !token) return;
    const sid = sceneIdRef.current;
    if (!sid) return;
    setCharGeomOverride(prev => ({ ...prev, [characterId]: { ...prev[characterId], w, h } })); // optimistic; survives remount
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

  // Commit a character token's rotation. Same optimistic-override + PUT pattern as the resize
  // above; the server broadcasts over WS and every client refetches.
  const handleRotateCharacter = async (characterId, rotation) => {
    if (!gameId || !token) return;
    const sid = sceneIdRef.current;
    if (!sid) return;
    setCharGeomOverride(prev => ({ ...prev, [characterId]: { ...prev[characterId], rotation } }));
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/scenes/${sid}/characters/${characterId}`, {
        method: 'PUT',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ rotation }),
      });
    } catch (error) {
      console.error('Error rotating character:', error);
    }
  };

  // Multiplayer: Remove character from grid (scene-aware)
  const handleRemoveCharacter = async (characterId) => {
    if (!gameId || !token) return;

    const sid = sceneIdRef.current;
    if (!sid) return; // scene-scoped: removing from grid, never deleting the character entity

    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}/scenes/${sid}/characters/${characterId}`, {
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
          // A placement is on the scene whether or not a whole cell is free for it — the token layer
          // renders from the placements, so this set must not be gated on the zone lookup below or a
          // token would show on the map and stay listed as available in the sidebar at the same time.
          characterIdsOnGrid.add(gameChar.characterId);
          // fightZones is a whole-cell grid holding at most one character per cell; it still backs
          // the sidebar and the snap-mode occupancy rule, so mirror the placement into the nearest
          // cell when one is free. In free mode two tokens can round into the same cell — the loser
          // simply has no zone, which no longer costs it anything.
          const zoneIndex = clearedZones.findIndex(
            z => z.col === Math.round(gameChar.positionX) && z.row === Math.round(gameChar.positionY)
          );
          if (zoneIndex !== -1) {
            const fullChar = allCharacters.find(c => c.id === gameChar.characterId);
            // Use full character data if accessible; otherwise fall back to scene token data
            const charData = fullChar
              ? normalizeCharacter(fullChar)
              : { id: gameChar.characterId, name: gameChar.name, avatar: gameChar.avatar, isEnemy: gameChar.isEnemy, killed: gameChar.killed, stats: {}, gridOnly: true };
            clearedZones[zoneIndex] = { ...clearedZones[zoneIndex], character: charData };
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

  // Placed character tokens for the unified layer, built from the scene's server placements — see
  // utils/placedCharacters.js for why the position no longer comes from the fightZones grid.
  const isMultiplayer = !!(gameId && token);
  const sceneChars = currentScene?.characters || [];
  const placedCharacters = buildPlacedCharacters(sceneChars, {
    resolveCharacter,
    overrides: charGeomOverride,
    canDrag: (id) => !isMultiplayer || isGM || isOwnCharacter(id),
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
          {/* Scene tools — armed-layer picker (GM) stacked above the tool bar, bottom-right */}
          {currentScene && (
            <div className="scene-tools">
              <LayerSelector
                imageEditLayer={imageEditLayer}
                onImageEditLayerChange={onImageEditLayerChange}
                isGM={isGM}
              />
              <DrawingToolbar
                editingLayer={editingLayer}
                onEditingLayerChange={onEditingLayerChange}
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
            </div>
          )}

          {/* Fight Grid with Scene Layers */}
          <SceneViewport scene={currentScene} isGM={isGM} gameId={gameId} editingLayer={editingLayer} imageEditLayer={imageEditLayer} gridWidth={gridWidth} gridHeight={gridHeight} onZoomChange={setViewportZoom} sendMessage={sendMessage} pointerPings={pointerPings} onRemovePing={onRemovePing} brushSize={brushSize} activeTool={activeTool} fogCoverMode={fogCoverMode} onFogPathComplete={onFogPathComplete} drawingColor={drawingColor} drawingFontSize={drawingFontSize} onDrawingPathComplete={onDrawingPathComplete} selectedPathId={selectedDrawingPathId} onSelectionChange={setSelectedDrawingPathId} onDeletePath={handleDeleteSelectedDrawing} controlScheme={controlScheme} onBackgroundClick={clearActiveToken} selectedImageId={selectedImageId} onSelectImage={handleSelectImage} gameSystem={gameSystem} tokenPlacementMode={tokenPlacementMode} userId={userId} userName={userName} measurementMetric={measurementMetric} cellDistance={cellDistance} distanceUnit={distanceUnit} mapRulers={sceneRulers} dragRuler={dragRuler} onTokenDragMeasureStart={handleTokenDragMeasureStart} onTokenDragMeasureMove={handleTokenDragMeasureMove} onTokenDragMeasureEnd={handleTokenDragMeasureEnd} aoeEnabled={aoeMeasure} placedCharacters={placedCharacters} isMultiplayer={isMultiplayer} tokenDisplay={tokenDisplay} token={token} activeTokenId={activeTokenId} onSelectCharacter={handleSelectToken} onCommitMove={handleCommitCharacterMove} onCommitResize={handleResizeCharacter} onCommitRotate={handleRotateCharacter} selectedTokens={selectedTokens} onMarqueeSelect={handleMarqueeSelect} onCommitGroupMove={handleCommitGroupMove} isTokenSelected={isTokenSelected} onToggleTokenSelected={toggleTokenSelected} onGroupDelete={handleGroupDelete} onGroupSetLock={handleGroupSetLock} onGroupSetLayer={handleGroupSetLayer} onGroupResetRotation={handleGroupResetRotation} />
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