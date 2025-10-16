import React, {useEffect, useMemo, useRef, useState} from 'react';
import axiosInstance from '../api/axios';
import FightArea from './FightArea';
import CharactersList from './CharactersList';
import Character from './Character';
import {DndContext, DragOverlay} from '@dnd-kit/core';

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

function DragAndDropContext({ addLogMessage }) {
  const [initialCharacters, setInitialCharacters] = useState([]);
  const fightZonesRef = useRef(generateFightZones());
  const [fightZones, setFightZones] = useState(fightZonesRef.current);
  const [characters, setCharacters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [attacker, setAttacker] = useState(null);

  const [highlightedTargets, setHighlightedTargets] = useState(new Set());

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
  const setCurrentDefender = (character) => {
      console.log("Defender set to:", character?.basicInfo?.name);
      handleAttack(attacker, character);
  };

  const handleAttack = async (attacker, defender) => {
    console.log("handleAttack called with:", { attacker, defender });
          try {

              const response = await axiosInstance.post('/fight', {
                  attacker: {
                      id: attacker?.id,
                      modifier: attacker?.modifier || 0
                  },
                  defender: {
                      id: defender?.id,
                      modifier: defender?.modifier || 0
                  },
              });
              addLogMessage(`Fight initiated:`, 'warning');
              console.log('Fight initiated:', {attacker, defender});
              for (const message in response.data.messages) {
                  addLogMessage(response.data.messages[message], 'info');
              }
              console.log('Fight result:', response.data);
              setAttacker(null);
              clearHighlightedTargets();
          } catch (error) {
              console.error('Error initiating fight:', error);
          }
    };

  const fetchCharacters = async () => {
    try {
      setIsLoading(true);
      const res = await axiosInstance.get('/my-characters');
      setInitialCharacters(res.data);
      setCharacters(res.data);
      setError(null);
    } catch (e) {
      console.error(e);
      setError('Nie udało się pobrać postaci.');
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => { fetchCharacters(); }, []);

  const handleDragStart = e => setActiveId(e.active.id);
  const handleDragOver = e => setOverId(e.over ? e.over.id : null);
  
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) { setActiveId(null); setOverId(null); return; }
    
    const draggedId = active.id;
    const overZoneId = over.id;

    // Znajdź przeciąganą postać
    let draggedChar =
      characters.find(c => c.id === draggedId) ||
      fightZones.find(z => z.character?.id === draggedId)?.character;

    if (!draggedChar) { setActiveId(null); setOverId(null); return; }

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
      setCharacters(prev => prev.filter(c => c.id !== draggedId));
      
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
      setCharacters(prev => prev.some(c => c.id === draggedId) ? prev : [...prev, draggedChar]);
    }

    setActiveId(null);
    setOverId(null);
  };

  const handleReset = () => {
    setFightZones(fightZonesRef.current.map(z => ({ ...z, character: null })));
    setCharacters(initialCharacters);
  };

  const activeCharacter = useMemo(() => {
    if (!activeId) return null;
    return characters.find(c => c.id === activeId) ||
           fightZones.find(z => z.character?.id === activeId)?.character || null;
  }, [activeId, characters, fightZones]);

  if (isLoading) return <div>Ładowanie postaci...</div>;
  if (error) return <div style={{color:'red', padding:20}}>{error} <button onClick={fetchCharacters}>Odśwież</button></div>;

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="dnd-context">
        <CharactersList
          characters={characters}
          addLogMessage={addLogMessage}
          activeId={activeId}
        />
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
            />
          ))}
        </div>
      </div>
      <button onClick={handleReset} className="reset-button">Resetuj</button>

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
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default DragAndDropContext;