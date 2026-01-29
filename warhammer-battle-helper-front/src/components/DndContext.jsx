import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import axiosInstance, { getApiUrl, getApiHeaders } from '../api/axios';
import FightArea from './FightArea';
import CharacterDetailsPanel from './CharacterDetailsPanel';
import Character from './Character';
import ModifierSelectionModal from './ModifierSelectionModal';
import {DndContext, DragOverlay, useSensor, useSensors, PointerSensor} from '@dnd-kit/core';

const GRID_SIZE = 20;
const generateFightZones = () => {
  const zones = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      zones.push({ id: `zone-${r}-${c}`, row: r, col: c, character: null }); // character zamiast characters
    }
  }
  return zones;
};

function DragAndDropContext({ addLogMessage, gameId = null, token = null, characterUpdateTrigger = 0 }) {
  const [initialCharacters, setInitialCharacters] = useState([]);
  const fightZonesRef = useRef(generateFightZones());
  const [fightZones, setFightZones] = useState(fightZonesRef.current);
  const [characters, setCharacters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [attacker, setAttacker] = useState(null);
  const hasInitializedRef = useRef(false);

  const [highlightedTargets, setHighlightedTargets] = useState(new Set());

  // Selected character for details panel
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [attackModifier, setAttackModifier] = useState(0);

  // Modifier selection modal
  const [showModifierModal, setShowModifierModal] = useState(false);
  const [pendingDefender, setPendingDefender] = useState(null);
  const [mousePosition, setMousePosition] = useState(null);

  // Keep fightZonesRef in sync with fightZones state
  useEffect(() => {
    fightZonesRef.current = fightZones;
  }, [fightZones]);

  // Get set of user's own character IDs
  const ownCharacterIds = useMemo(() => {
    return new Set((initialCharacters || []).map(c => c.id));
  }, [initialCharacters]);

  // Check if a character belongs to the current user
  const isOwnCharacter = useCallback((characterId) => {
    return ownCharacterIds.has(characterId);
  }, [ownCharacterIds]);

  // Select character and highlight nearby targets
  const handleSelectCharacter = (character) => {
    // Only allow selecting own characters in multiplayer mode
    if (gameId && token && !isOwnCharacter(character.id)) {
      return; // Don't select other players' characters
    }

    setSelectedCharacter(character);
    setAttackModifier(0);

    // Find the zone where this character is located
    const characterZone = fightZones.find(z => z.character?.id === character.id);
    if (characterZone) {
      // Highlight nearby targets
      highlightPossibleTargets(characterZone, fightZones);
      setAttacker(character);
    } else {
      clearHighlightedTargets();
    }
  };

  // Handle attack from details panel
  const handlePanelAttack = () => {
    if (!selectedCharacter) return;

    const characterZone = fightZones.find(z => z.character?.id === selectedCharacter.id);
    if (characterZone) {
      highlightPossibleTargets(characterZone, fightZones);
      setAttacker(selectedCharacter);
    }
  };

  // Dodaj te funkcje przed return
  const highlightPossibleTargets = (attackerZone, allFightZones) => {
    console.log("Attacker:", attacker);
      if (!attackerZone || !allFightZones) {
          setHighlightedTargets(new Set());
          return;
      }

      const currentRow = attackerZone.row;
      const currentCol = attackerZone.col;
      
      const nearbyTargetIds = new Set();
      allFightZones.forEach(zone => {
          const rowDiff = Math.abs(zone.row - currentRow);
          const colDiff = Math.abs(zone.col - currentCol);
          
          if (rowDiff <= 1 && colDiff <= 1 && zone.character && zone.character.id !== attackerZone.character?.id) {
              nearbyTargetIds.add(zone.character.id);
          }
      });

      setHighlightedTargets(nearbyTargetIds);
  };

  const clearHighlightedTargets = () => {
      setHighlightedTargets(new Set());
  };

  const setCurrentAttacker = (character) => {
      setAttacker(character);
      console.log("Attacker set to:", character?.basicInfo?.name);
      console.log("highlightedTargets:", [...highlightedTargets]);

  };
  const setCurrentDefender = (character, event) => {
      console.log("Defender set to:", character?.basicInfo?.name);
      setPendingDefender(character);

      // Capture mouse position from the event
      if (event) {
          setMousePosition({ x: event.clientX, y: event.clientY });
      }

      setShowModifierModal(true);
  };

  // Multiplayer: Add character to grid
  const handleAddCharacterToGrid = async (characterId, positionX, positionY, isEnemy) => {
    if (!gameId || !token) return;

    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}/characters`, {
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

  // Multiplayer: Move character on grid
  const handleMoveCharacter = async (characterId, positionX, positionY) => {
    if (!gameId || !token) return;

    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}/characters/move`, {
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

  // Multiplayer: Remove character from grid
  const handleRemoveCharacter = async (characterId) => {
    if (!gameId || !token) return;

    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}/characters/${characterId}`, {
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

  const handleAttack = async (attacker, defender, modifier = 0) => {
    console.log("handleAttack called with:", { attacker, defender, modifier });

    try {
      // If in multiplayer mode, use game-specific endpoint
      if (gameId && token) {
        const response = await fetch(`${getApiUrl()}/games/${gameId}/fight`, {
          method: 'POST',
          headers: getApiHeaders({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }),
          body: JSON.stringify({
            attacker: {
              id: attacker?.id,
              modifier: modifier
            },
            defender: {
              id: defender?.id,
              modifier: 0
            }
          })
        });

        if (!response.ok) {
          throw new Error('Failed to initiate fight');
        }

        // Messages will come via WebSocket
        console.log('Fight initiated in multiplayer mode');
      } else {
        // Single-player mode
        const response = await axiosInstance.post('/fight', {
          attacker: {
            id: attacker?.id,
            modifier: modifier
          },
          defender: {
            id: defender?.id,
            modifier: 0
          },
        });
        addLogMessage(`Fight initiated:`, 'warning');
        console.log('Fight initiated:', {attacker, defender, modifier});
        for (const message in response.data.messages) {
          addLogMessage(response.data.messages[message], 'info');
        }
        console.log('Fight result:', response.data);
      }

      setAttacker(null);
      clearHighlightedTargets();
    } catch (error) {
      console.error('Error initiating fight:', error);
      addLogMessage('Failed to initiate fight', 'error');
    }
  };

  const handleModifierConfirm = (modifier) => {
    setShowModifierModal(false);
    handleAttack(attacker, pendingDefender, modifier);
    setPendingDefender(null);
  };

  const handleModifierCancel = () => {
    setShowModifierModal(false);
    setPendingDefender(null);
  };

  const fetchCharacters = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await axiosInstance.get('/my-characters');
      const charactersData = res.data || [];
      setInitialCharacters(charactersData);

      // Filter out characters that are currently on the grid
      // Use functional update to read current fightZones without adding it as dependency
      setCharacters(prevCharacters => {
        // Add null check for fightZonesRef.current
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
      setError('Nie udało się pobrać postaci.');
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  // Fetch game state and populate characters on grid (multiplayer mode)
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
      console.log('Game characters loaded:', game.characters);

      // Reset fight zones first
      const clearedZones = generateFightZones();

      // Populate fight zones with characters from the game
      if (game.characters && game.characters.length > 0) {
        // Get all full character data first
        const allCharsResponse = await axiosInstance.get('/characters');
        const allCharacters = allCharsResponse.data || [];

        // Track which character IDs are on the grid
        const characterIdsOnGrid = new Set();

        game.characters.forEach(gameChar => {
          // positionX is col, positionY is row
          const zoneIndex = clearedZones.findIndex(
            z => z.col === gameChar.positionX && z.row === gameChar.positionY
          );
          if (zoneIndex !== -1) {
            const fullChar = allCharacters.find(c => c.id === gameChar.characterId);
            if (fullChar) {
              clearedZones[zoneIndex] = { ...clearedZones[zoneIndex], character: fullChar };
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
  }, [gameId, token]);

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

  // Watch for character updates in multiplayer mode
  useEffect(() => {
    // Don't check characters.length - we need to refetch even if pool is empty
    if (gameId && token && characterUpdateTrigger > 0) {
      console.log('Character update trigger changed:', characterUpdateTrigger);
      fetchGameCharacters();
    }
  }, [characterUpdateTrigger, fetchGameCharacters, gameId, token]);

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

    // In multiplayer mode, only allow moving own characters
    if (gameId && token && !isOwnCharacter(draggedChar.id)) {
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
        {/* Left Sidebar */}
        <div className="left-sidebar">
          <CharacterDetailsPanel
            character={selectedCharacter}
            onAttack={handlePanelAttack}
            onCharacterUpdate={handleCharacterUpdate}
            modifier={attackModifier}
            onFortuneChange={setAttackModifier}
            addLogMessage={addLogMessage}
            gameId={gameId}
            token={token}
          />

          {/* Characters List - always show all characters */}
          <div className="characters-list">
            <h3>Your Characters</h3>
            <div className="characters-list-content">
              {(initialCharacters || []).map(char => {
                const onGrid = isCharacterOnGrid(char.id);
                const isSelected = selectedCharacter?.id === char.id;

                const handleGridToggle = async (e) => {
                  e.stopPropagation(); // Prevent selection when clicking button

                  if (onGrid) {
                    // Remove from grid
                    if (gameId && token) {
                      // Multiplayer mode - sync with backend
                      await handleRemoveCharacter(char.id);
                    } else {
                      // Single-player mode - update locally
                      setFightZones(prev =>
                        prev.map(zone =>
                          zone.character?.id === char.id
                            ? { ...zone, character: null }
                            : zone
                        )
                      );
                    }
                  } else {
                    // Add to grid - find first empty zone
                    const emptyZoneIndex = fightZones.findIndex(z => !z.character);
                    if (emptyZoneIndex !== -1) {
                      const targetZone = fightZones[emptyZoneIndex];

                      if (gameId && token) {
                        // Multiplayer mode - sync with backend
                        // col is X, row is Y
                        await handleAddCharacterToGrid(char.id, targetZone.col, targetZone.row, false);
                      } else {
                        // Single-player mode - update locally
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
                    className={`character-tile ${isSelected ? 'selected' : ''} ${onGrid ? 'on-grid' : ''}`}
                    onClick={() => handleSelectCharacter(char)}
                  >
                    <div className="character-tile-header">
                      <div className="character-name">{char.basicInfo?.name}</div>
                      <div className="character-hp">
                        {char.secondaryAttributes?.wounds?.current || '-'}/{char.secondaryAttributes?.wounds?.max || '-'} HP
                      </div>
                    </div>
                    <div className="character-position">
                      {onGrid ? 'On Grid' : 'Available'}
                      <button
                        className="grid-toggle-btn"
                        onClick={handleGridToggle}
                        title={onGrid ? 'Remove from grid' : 'Add to grid'}
                      >
                        {onGrid ? '←' : '→'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Fight Grid */}
        <div className="fight-grid">
          {fightZones.map(zone => (
            <FightArea
                key={zone.id}
                currentZone={zone}
                fightZones={fightZones}
                addLogMessage={addLogMessage}
                isActiveDrop={overId === zone.id}
                activeId={activeId}
                highlightedTargets={highlightedTargets}
                highlightPossibleTargets={highlightPossibleTargets}
                clearHighlightedTargets={clearHighlightedTargets}
                setCurrentAttacker={setCurrentAttacker}
                setCurrentDefender={setCurrentDefender}
                onCharacterUpdate={handleCharacterUpdate}
                onSelectCharacter={handleSelectCharacter}
                selectedCharacterId={selectedCharacter?.id}
                isOwnCharacter={zone.character ? isOwnCharacter(zone.character.id) : false}
                isMultiplayer={!!(gameId && token)}
            />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeCharacter && (
          <div className="drag-overlay-wrapper">
            <Character
              character={activeCharacter}
              currentZone={null}
              fightZones={fightZones}
              addLogMessage={()=>{}}
              onFightComplete={()=>{}}
              activeId={activeId}
              isOverlay
              isHighlighted={false}
              highlightPossibleTargets={highlightPossibleTargets}
              clearHighlightedTargets={clearHighlightedTargets}
              setCurrentAttacker={setCurrentAttacker}
              onCharacterUpdate={handleCharacterUpdate}
            />
          </div>
        )}
      </DragOverlay>

      {/* Modifier Selection Modal */}
      {showModifierModal && (
        <ModifierSelectionModal
          mousePosition={mousePosition}
          onConfirm={handleModifierConfirm}
          onCancel={handleModifierCancel}
        />
      )}
    </DndContext>
  );
}

export default DragAndDropContext;