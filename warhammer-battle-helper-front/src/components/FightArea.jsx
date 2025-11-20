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
    selectedCharacterId
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
        if (currentZone.character && onSelectCharacter) {
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
                    />
                </div>
            )}
        </div>
    );
}

export default FightArea;