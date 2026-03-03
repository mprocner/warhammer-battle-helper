import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl, getApiHeaders } from '../api/axios';
import FightArea from './FightArea';
import CharacterDetailsPanel from './CharacterDetailsPanel';
import Character from './Character';
import CloneCharacterModal from './CloneCharacterModal';
import CharacterVisibilityModal from './CharacterVisibilityModal';
import SceneViewport from './scene/SceneViewport';
import DrawingToolbar from './scene/DrawingToolbar';
import { CELL_SIZE } from '../constants/scene';
import { undoLastDrawingPath, clearDrawingPaths, undoLastFogPath, clearFogPaths, revealAllFog, deleteDrawingPath } from '../api/scenes';
import {DndContext, DragOverlay, useSensor, useSensors, PointerSensor} from '@dnd-kit/core';
import VisibilityIcon from '@mui/icons-material/Visibility';

const DEFAULT_GRID_WIDTH = 20;
const DEFAULT_GRID_HEIGHT = 20;

/**
 * Normalizes a character received from the API.
 * For Warhammer characters the Warhammer-specific data lives inside `stats`,
 * but the existing CharacterSheetPopup / CharacterDetailsPanel still access
 * fields like character.basicInfo, character.characteristics, etc. directly.
 * We spread stats into the root so old components keep working unchanged.
 */
function normalizeCharacter(char) {
  if (!char) return char;
  // Only flatten for warhammer4e (or legacy chars with no gameSystem)
  if (char.gameSystem && char.gameSystem !== 'warhammer4e') return char;
  if (char.stats && typeof char.stats === 'object') {
    return { ...char.stats, ...char };
  }
  return char;
}
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

const snapCenterToCursor = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (draggingNodeRect && activatorEvent) {
    const offsetX = activatorEvent.clientX - draggingNodeRect.left;
    const offsetY = activatorEvent.clientY - draggingNodeRect.top;
    return {
      ...transform,
      x: transform.x + offsetX - draggingNodeRect.width / 2,
      y: transform.y + offsetY - draggingNodeRect.height / 2,
    };
  }
  return transform;
};

function DragAndDropContext({ addLogMessage, gameId = null, token = null, gameSystem = 'warhammer4e', characterUpdateTrigger = 0, characterDataTrigger = 0, isHidden = false, onTogglePanel, currentScene = null, isGM = false, userId = null, participants = [], editingLayer = 'grid', onEditingLayerChange, fogCoverMode = false, onFogCoverModeChange, sendMessage = null, pointerPings = [], onRemovePing, onFogPathComplete, activeTool = 'freehand', onActiveToolChange, brushSize = 10, onBrushSizeChange, drawingColor = '#ff0000', onDrawingColorChange, drawingFontSize = 16, onDrawingFontSizeChange, onDrawingPathComplete, onDeleteDrawingPath, currentSceneId = null }) {
  const { t } = useTranslation();
  const [initialCharacters, setInitialCharacters] = useState([]);
  const gridWidth = currentScene?.gridWidth || DEFAULT_GRID_WIDTH;
  const gridHeight = currentScene?.gridHeight || DEFAULT_GRID_HEIGHT;
  const gridVisible = currentScene?.gridVisible !== false;
  const sceneId = currentScene?.id || null;

  const fightZonesRef = useRef(generateFightZones(gridWidth, gridHeight));
  const [fightZones, setFightZones] = useState(fightZonesRef.current);
  const [characters, setCharacters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [viewportZoom, setViewportZoom] = useState(1);
  const hasInitializedRef = useRef(false);

  // Selected character for details panel
  const [selectedCharacter, setSelectedCharacter] = useState(null);

  // Auto-open character sheet after creating new character
  const [autoOpenCharacterSheet, setAutoOpenCharacterSheet] = useState(false);

  // Clone character popup
  const [cloneTarget, setCloneTarget] = useState(null);

  // Visibility management popup (GM only)
  const [visibilityTarget, setVisibilityTarget] = useState(null);

  // Collapsible character list sections
  const [pcListCollapsed, setPcListCollapsed] = useState(false);
  const [npcListCollapsed, setNpcListCollapsed] = useState(false);

  // Resizable sidebar split
  const [splitPercent, setSplitPercent] = useState(50);
  const [isSplitDragging, setIsSplitDragging] = useState(false);
  const sidebarContentRef = useRef(null);
  const splitDraggingRef = useRef(false);

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
    setSelectedCharacter(freshChar);
  };

  // Multiplayer: Add character to grid (scene-aware)
  const handleAddCharacterToGrid = async (characterId, positionX, positionY, isEnemy) => {
    if (!gameId || !token) return;

    const url = sceneId
      ? `${getApiUrl()}/games/${gameId}/scenes/${sceneId}/characters`
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

    const url = sceneId
      ? `${getApiUrl()}/games/${gameId}/scenes/${sceneId}/characters/move`
      : `${getApiUrl()}/games/${gameId}/characters/move`;

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: getApiHeaders({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }),
        body: JSON.stringify({
          characterId,
          positionX,
          positionY
        })
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

  // Multiplayer: Remove character from grid (scene-aware)
  const handleRemoveCharacter = async (characterId) => {
    if (!gameId || !token) return;

    const url = sceneId
      ? `${getApiUrl()}/games/${gameId}/scenes/${sceneId}/characters/${characterId}`
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

      await fetchCharacters();
      setSelectedCharacter(createdCharacter);
      setAutoOpenCharacterSheet(true);
    } catch (err) {
      console.error('Failed to create character:', err);
      addLogMessage(t('character.createError'), 'error');
    }
  }, [gameId, token, fetchCharacters, addLogMessage, t]);

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

      await fetchCharacters();
      setSelectedCharacter(createdCharacter);
      setAutoOpenCharacterSheet(true);
    } catch (err) {
      console.error('Failed to create NPC:', err);
      addLogMessage(t('character.createError'), 'error');
    }
  }, [gameId, token, fetchCharacters, addLogMessage, t]);

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
      await fetchCharacters();
      setCloneTarget(null);
    } catch (err) {
      console.error('Failed to clone character:', err);
      addLogMessage(t('character.cloneError'), 'error');
    }
  }, [cloneTarget, gameId, token, fetchCharacters, addLogMessage, t]);

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
            if (fullChar) {
              clearedZones[zoneIndex] = { ...clearedZones[zoneIndex], character: normalizeCharacter(fullChar) };
              characterIdsOnGrid.add(gameChar.characterId);
            }
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

  // Character data changed (sheet edit, visibility) — silent refetch, no loading flash
  useEffect(() => {
    if (gameId && token && characterDataTrigger > 0) {
      fetchCharacters(true);
    }
  }, [characterDataTrigger, fetchCharacters, gameId, token]);

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

  const handleDragStart = e => setActiveId(e.active.id);
  const handleDragOver = e => setOverId(e.over ? e.over.id : null);
  
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) { setActiveId(null); setOverId(null); return; }

    const draggedId = active.id;
    const overZoneId = over.id;

    // Znajdź przeciąganą postać
    let draggedChar = null;
    if (characters && Array.isArray(characters)) {
      draggedChar = characters.find(c => c.id === draggedId);
    }
    if (!draggedChar && fightZones) {
      draggedChar = fightZones.find(z => z.character?.id === draggedId)?.character;
    }

    if (!draggedChar) { setActiveId(null); setOverId(null); return; }

    // In multiplayer mode, only allow moving own characters (GM can move any)
    if (gameId && token && !isGM && !isOwnCharacter(draggedChar.id)) {
      setActiveId(null); setOverId(null); return;
    }

    // Znajdź obecną strefę postaci
    const currentZoneIndex = fightZones.findIndex(z => z.character?.id === draggedId);
    
    // Jeśli upuszczamy w tej samej strefie - nic nie rób
    if (currentZoneIndex !== -1 && fightZones[currentZoneIndex].id === overZoneId) {
      setActiveId(null); setOverId(null); return;
    }

    const targetZoneIndex = fightZones.findIndex(z => z.id === overZoneId);
    
    if (targetZoneIndex !== -1) {
      // Upuszczamy w strefie
      const targetZone = fightZones[targetZoneIndex];

      // Sprawdź czy strefa jest pusta
      if (targetZone.character) {
        addLogMessage(`Strefa ${overZoneId} jest już zajęta przez ${targetZone.character.basicInfo?.name}`, 'warning');
        setActiveId(null); setOverId(null); return;
      }

      // If in multiplayer mode, sync with backend
      if (gameId && token) {
        if (currentZoneIndex === -1) {
          // Adding character to grid (from available pool)
          // col is X, row is Y
          handleAddCharacterToGrid(draggedChar.id, targetZone.col, targetZone.row, false);
        } else {
          // Moving character on grid
          // col is X, row is Y
          handleMoveCharacter(draggedChar.id, targetZone.col, targetZone.row);
        }
      }

      setFightZones(prev =>
        prev.map((zone, idx) => {
          if (idx === currentZoneIndex) {
            // Usuń z obecnej strefy
            return { ...zone, character: null };
          }
          if (idx === targetZoneIndex) {
            // Dodaj do docelowej strefy
            return { ...zone, character: draggedChar };
          }
          return zone;
        })
      );

      // Usuń z listy dostępnych
      setCharacters(prev => {
        if (!prev || !Array.isArray(prev)) return [];
        return prev.filter(c => c.id !== draggedId);
      });
      
    } else if (overZoneId === 'available-pool') {
      // Wracamy do listy dostępnych
      if (currentZoneIndex !== -1) {
        setFightZones(prev =>
          prev.map((zone, idx) =>
            idx === currentZoneIndex
              ? { ...zone, character: null }
              : zone
          )
        );
      }
      setCharacters(prev => {
        if (!prev || !Array.isArray(prev)) return [];
        return prev.some(c => c.id === draggedId) ? prev : [...prev, draggedChar];
      });
    }

    setActiveId(null);
    setOverId(null);
  };


  const activeCharacter = useMemo(() => {
    if (!activeId) return null;
    if (!characters || !fightZones) return null;
    return characters.find(c => c.id === activeId) ||
           fightZones.find(z => z.character?.id === activeId)?.character || null;
  }, [activeId, characters, fightZones]);

  // Configure drag sensors with distance threshold to allow clicks
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    })
  );

  useEffect(() => {
    if (isSplitDragging) {
      document.body.style.cursor = 'ns-resize';
    } else {
      document.body.style.cursor = '';
    }
    return () => {
      document.body.style.cursor = '';
    };
  }, [isSplitDragging]);

  const handleResizerMouseDown = useCallback((e) => {
    e.preventDefault();
    splitDraggingRef.current = true;
    setIsSplitDragging(true);

    const onMouseMove = (e) => {
      if (!splitDraggingRef.current || !sidebarContentRef.current) return;
      const rect = sidebarContentRef.current.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const percent = (relativeY / rect.height) * 100;
      setSplitPercent(Math.min(85, Math.max(15, percent)));
    };

    const onMouseUp = () => {
      splitDraggingRef.current = false;
      setIsSplitDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  if (isLoading) return <div>Ładowanie postaci...</div>;
  if (error) return <div style={{color:'red', padding:20}}>{error} <button onClick={fetchCharacters}>Odśwież</button></div>;

  // Check if character is on grid
  const isCharacterOnGrid = (charId) => {
    return fightZones.some(z => z.character?.id === charId);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="dnd-context">
        {/* Left Sidebar with Toggle */}
        <div className="left-sidebar-wrapper">
          <div className={`left-sidebar ${isHidden ? 'left-sidebar--hidden' : ''}`}>
            {/* Sidebar Header */}
            <header className="panel-header">
              <h2 className="panel-header__title">{t('leftPanel.title')}</h2>
            </header>
            <div
              className="sidebar-resizable-container"
              ref={sidebarContentRef}
              style={{ userSelect: isSplitDragging ? 'none' : 'auto' }}
            >
              <div className="sidebar-top-section" style={{ height: `${splitPercent}%` }}>
                <CharacterDetailsPanel
                  character={selectedCharacter}
                  onCharacterUpdate={handleCharacterUpdate}
                  addLogMessage={addLogMessage}
                  gameId={gameId}
                  token={token}
                  isGM={isGM}
                  gameSystem={gameSystem}
                  autoOpenSheet={autoOpenCharacterSheet}
                  onSheetOpened={() => setAutoOpenCharacterSheet(false)}
                />
              </div>

              <div
                className={`sidebar-resizer${isSplitDragging ? ' sidebar-resizer--dragging' : ''}`}
                onMouseDown={handleResizerMouseDown}
              />

              <div className="sidebar-bottom-section">
                <div className="characters-list">
            {(() => {
              const pcCharacters = (initialCharacters || []).filter(c => !c.isNPC);
              const npcCharacters = (initialCharacters || []).filter(c => c.isNPC);

              const renderCharacterTile = (char) => {
                const onGrid = isCharacterOnGrid(char.id);
                const isSelected = selectedCharacter?.id === char.id;

                const handleGridToggle = async (e) => {
                  e.stopPropagation();

                  if (onGrid) {
                    if (gameId && token) {
                      await handleRemoveCharacter(char.id);
                    } else {
                      setFightZones(prev =>
                        prev.map(zone =>
                          zone.character?.id === char.id
                            ? { ...zone, character: null }
                            : zone
                        )
                      );
                    }
                  } else {
                    const emptyZoneIndex = fightZones.findIndex(z => !z.character);
                    if (emptyZoneIndex !== -1) {
                      const targetZone = fightZones[emptyZoneIndex];

                      if (gameId && token) {
                        await handleAddCharacterToGrid(char.id, targetZone.col, targetZone.row, false);
                      } else {
                        setFightZones(prev =>
                          prev.map((zone, idx) =>
                            idx === emptyZoneIndex
                              ? { ...zone, character: char }
                              : zone
                          )
                        );
                      }
                    } else {
                      addLogMessage('No empty spaces on grid', 'warning');
                    }
                  }
                };

                return (
                  <div
                    key={char.id}
                    ref={el => { if (el) characterTileRefs.current[char.id] = el; else delete characterTileRefs.current[char.id]; }}
                    className={`character-tile ${isSelected ? 'selected' : ''} ${onGrid ? 'on-grid' : ''}`}
                    onClick={() => handleSelectCharacter(char)}
                  >
                    <div className="character-tile-header">
                      <div className="character-name">{char.basicInfo?.name || char.name}</div>
                      <div className="character-hp">
                        {char.secondaryAttributes?.wounds?.current || '-'}/{char.secondaryAttributes?.wounds?.max || '-'} HP
                      </div>
                    </div>
                    {isGM && char.createdBy && (
                      <div className="character-owner">
                        {participants.find(p => p.userId === char.createdBy)?.username || 'GM'}
                      </div>
                    )}
                    <div className="character-position">
                      {onGrid ? t('leftPanel.onGrid') : t('leftPanel.available')}
                      <div className="character-actions">
                        {isGM && (
                          <>
                            <button
                              className="clone-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCloneTarget(char);
                              }}
                              title={t('character.clone')}
                            >
                              ⧉
                            </button>
                            <button
                              className="visibility-btn"
                              onClick={(e) => { e.stopPropagation(); setVisibilityTarget(char); }}
                              title={t('character.manageVisibility')}
                            >
                              <VisibilityIcon style={{ fontSize: 14 }} />
                            </button>
                          </>
                        )}
                        <button
                          className="grid-toggle-btn"
                          onClick={handleGridToggle}
                          title={onGrid ? t('leftPanel.removeFromGrid') : t('leftPanel.addToGrid')}
                        >
                          {onGrid ? '←' : '→'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              };

              return (
                <>
                  {/* PC Section */}
                  <div className="characters-list-header">
                    <div className="characters-list-header-left" onClick={() => setPcListCollapsed(v => !v)}>
                      <button className="section-collapse-btn">
                        {pcListCollapsed ? '▶' : '▼'}
                      </button>
                      <h3>{t('leftPanel.yourCharacters')}</h3>
                    </div>
                    {gameId && (
                      <button className="add-character-btn" onClick={handleAddCharacter}>
                        + {t('character.addCharacter')}
                      </button>
                    )}
                  </div>
                  {!pcListCollapsed && (
                    <div className="characters-list-content">
                      {pcCharacters.map(char => renderCharacterTile(char))}
                    </div>
                  )}

                  {/* NPC Section (GM only) */}
                  {isGM && (
                    <>
                      <div className="characters-list-header characters-list-header--npc">
                        <div className="characters-list-header-left" onClick={() => setNpcListCollapsed(v => !v)}>
                          <button className="section-collapse-btn">
                            {npcListCollapsed ? '▶' : '▼'}
                          </button>
                          <h3>{t('leftPanel.npcList')}</h3>
                        </div>
                        <button className="add-character-btn" onClick={handleAddNPC}>
                          + {t('character.addCharacter')}
                        </button>
                      </div>
                      {!npcListCollapsed && (
                        <div className="characters-list-content">
                          {npcCharacters.map(char => renderCharacterTile(char))}
                        </div>
                      )}
                    </>
                  )}
                </>
              );
            })()}
                </div>
              </div>
            </div>
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
          {/* Drawing toolbar — floats over the scene, visible to all */}
          {currentScene && (
            <DrawingToolbar
              editingLayer={editingLayer}
              onEditingLayerChange={onEditingLayerChange}
              fogCoverMode={fogCoverMode}
              onFogCoverModeChange={onFogCoverModeChange}
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
          <SceneViewport scene={currentScene} isGM={isGM} gameId={gameId} editingLayer={editingLayer} gridWidth={gridWidth} gridHeight={gridHeight} onZoomChange={setViewportZoom} sendMessage={sendMessage} pointerPings={pointerPings} onRemovePing={onRemovePing} brushSize={brushSize} activeTool={activeTool} fogCoverMode={fogCoverMode} onFogPathComplete={onFogPathComplete} drawingColor={drawingColor} drawingFontSize={drawingFontSize} onDrawingPathComplete={onDrawingPathComplete} selectedPathId={selectedDrawingPathId} onSelectionChange={setSelectedDrawingPathId} onDeletePath={handleDeleteSelectedDrawing}>
            <div className="fight-grid">
              <div
                className={`fight-grid-inner ${!gridVisible ? 'grid-hidden' : ''}`}
                style={{ gridTemplateColumns: `repeat(${gridWidth}, ${CELL_SIZE}px)` }}
              >
                {fightZones.map(zone => (
                  <FightArea
                      key={zone.id}
                      currentZone={zone}
                      isActiveDrop={overId === zone.id}
                      activeId={activeId}
                      onSelectCharacter={handleSelectCharacter}
                      isOwnCharacter={zone.character ? (isGM || isOwnCharacter(zone.character.id)) : false}
                      isMultiplayer={!!(gameId && token)}
                  />
                ))}
              </div>
            </div>
          </SceneViewport>
        </div>
      </div>

      <DragOverlay modifiers={[snapCenterToCursor]}>
        {activeCharacter && (
          <div className="drag-overlay-wrapper" style={{ transform: `scale(${viewportZoom})` }}>
            <Character
              character={activeCharacter}
              currentZone={null}
              activeId={activeId}
              isOverlay
            />
          </div>
        )}
      </DragOverlay>

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

    </DndContext>
  );
}

export default DragAndDropContext;