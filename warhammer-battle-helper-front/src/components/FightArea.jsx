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
    setCurrentDefender
}) {
    const { isOver, setNodeRef } = useDroppable({ id: currentZone.id });

    const classNames = [
        'fight-zone',
        isOver && 'drag-over',
        isActiveDrop && 'drag-target'
    ].filter(Boolean).join(' ');

    return (
        <div ref={setNodeRef} className={classNames}>
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
                    />
                </div>
            )}
        </div>
    );
}

export default FightArea;