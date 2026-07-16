import React from 'react';
import {useDroppable} from '@dnd-kit/core';
import Character from './Character';

function FightArea({
    currentZone,
    isActiveDrop,
    activeId,
    onSelectToken,
    isOwnCharacter = true,
    isMultiplayer = false,
    tokenDisplay = null,
    activeTokenId = null,
    gameId = null,
    token = null
}) {
    const { isOver, setNodeRef } = useDroppable({ id: currentZone.id });

    const classNames = [
        'fight-zone',
        isOver && 'drag-over',
        isActiveDrop && 'drag-target',
    ].filter(Boolean).join(' ');

    const handleZoneClick = (e) => {
        // In multiplayer mode, only allow selecting own characters
        if (currentZone.character && onSelectToken) {
            if (isMultiplayer && !isOwnCharacter) {
                return; // Don't select other players' tokens (let it bubble → deactivate)
            }
            // Stop here so the grid-level deactivate handler doesn't undo the selection.
            e.stopPropagation();
            onSelectToken(currentZone.character);
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
                        tokenDisplay={tokenDisplay}
                        selected={activeTokenId === currentZone.character.id}
                        canEditToken={isOwnCharacter}
                        gameId={gameId}
                        token={token}
                    />
                </div>
            )}
        </div>
    );
}

export default FightArea;