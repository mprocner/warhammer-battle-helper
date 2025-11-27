import React, {useRef} from 'react';
import {useDraggable} from '@dnd-kit/core';
import Avatar from './Avatar';

function Character({
        currentZone,
        character,
        activeId, isOverlay = false,
        isHighlighted = false,
        setCurrentDefender,
    }) {
    
    console.log('Rendering Character:', character?.basicInfo?.name, 'in zone:', currentZone);
    const {attributes, listeners, setNodeRef, transform} = useDraggable({ id: character.id });
    const buttonRef = useRef(null);


    const style = isOverlay
        ? { opacity: 0.95, pointerEvents: 'none' }
        : (transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined);

    const isEnemy = character.basicInfo?.type === 'enemy';
    const isDragging = character.id === activeId && !isOverlay;
    const characterEntryClass = `character-entry${isEnemy ? " enemy" : ""} ${isDragging ? 'dragging' : ''}`;

    // attack button
    const targetButton = isHighlighted ? (
        <button className='target-btn'
            onClick={(e) => {
                e.stopPropagation();
                setCurrentDefender(character, e);
            }}
        >
            <img src="/img/attack.png" alt="Target" draggable="false" />
        </button>
    ) : null;

    return (
        <div className={"character-wrapper" + (isHighlighted ? ' possible-target' : '')}
        >
            <div
                id={character.id}
                ref={(node) => {
                    setNodeRef(node);
                    buttonRef.current = node;
                }}
                className={characterEntryClass + (currentZone?.id ? ' in-grid' : '')}
                style={style}
                
            >
                <div className="drag-handle" {...attributes} {...listeners}>
                    <Avatar src={character.basicInfo?.avatar} />
                </div>
                <span className="character-name">{character.basicInfo?.name}</span>
            </div>
            {targetButton}
        </div>
    );
}

export default Character;