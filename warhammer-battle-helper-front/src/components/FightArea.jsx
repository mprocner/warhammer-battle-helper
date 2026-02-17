import React from 'react';
import {useDroppable} from '@dnd-kit/core';
import Character from './Character';

function FightArea({
    currentZone,
    isActiveDrop,
    activeId,
    onSelectCharacter,
    isOwnCharacter = true,
    isMultiplayer = false
}) {
    const { isOver, setNodeRef } = useDroppable({ id: currentZone.id });

    const classNames = [
        'fight-zone',
        isOver && 'drag-over',
        isActiveDrop && 'drag-target',
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
                        activeId={activeId}
                        isOwnCharacter={isOwnCharacter}
                        isMultiplayer={isMultiplayer}
                    />
                </div>
            )}
        </div>
    );
}

export default FightArea;