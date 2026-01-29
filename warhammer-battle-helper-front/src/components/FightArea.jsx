import React from 'react';
import {useDroppable} from '@dnd-kit/core';
import Character from './Character';

function FightArea({
    currentZone,
    fightZones,
    addLogMessage,
    isActiveDrop,
    activeId,
    highlightedTargets,
    highlightPossibleTargets,
    clearHighlightedTargets,
    setCurrentAttacker,
    setCurrentDefender,
    onCharacterUpdate,
    onSelectCharacter,
    selectedCharacterId,
    isOwnCharacter = true,
    isMultiplayer = false
}) {
    const { isOver, setNodeRef } = useDroppable({ id: currentZone.id });

    const isSelected = currentZone.character && selectedCharacterId && currentZone.character.id === selectedCharacterId;

    const classNames = [
        'fight-zone',
        isOver && 'drag-over',
        isActiveDrop && 'drag-target',
        isSelected && 'selected'
    ].filter(Boolean).join(' ');

    const handleZoneClick = () => {
        // In multiplayer mode, only allow selecting own characters
        if (currentZone.character && onSelectCharacter) {
            if (isMultiplayer && !isOwnCharacter) {
                return; // Don't select other players' characters
            }
            onSelectCharacter(currentZone.character);
        }
    };

    return (
        <div ref={setNodeRef} className={classNames} onClick={handleZoneClick}>
            {currentZone.character && (
                <div className="zone-characters-row">
                    <Character
                        character={currentZone.character}
                        currentZone={currentZone}
                        fightZones={fightZones}
                        addLogMessage={addLogMessage}
                        onFightComplete={() => {}}
                        activeId={activeId}
                        isHighlighted={highlightedTargets.has(currentZone.character.id)}
                        highlightPossibleTargets={highlightPossibleTargets}
                        clearHighlightedTargets={clearHighlightedTargets}
                        setCurrentAttacker={setCurrentAttacker}
                        setCurrentDefender={setCurrentDefender}
                        onCharacterUpdate={onCharacterUpdate}
                        isOwnCharacter={isOwnCharacter}
                        isMultiplayer={isMultiplayer}
                    />
                </div>
            )}
        </div>
    );
}

export default FightArea;