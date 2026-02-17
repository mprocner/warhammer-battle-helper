import React, {useRef} from 'react';
import {useDraggable} from '@dnd-kit/core';
import Avatar from './Avatar';

function Character({
        currentZone,
        character,
        activeId, isOverlay = false,
        isOwnCharacter = true,
        isMultiplayer = false,
    }) {

    console.log('Rendering Character:', character?.basicInfo?.name, 'in zone:', currentZone);

    // Disable dragging for non-owned characters in multiplayer mode
    const canDrag = !isMultiplayer || isOwnCharacter;
    const {attributes, listeners, setNodeRef, transform} = useDraggable({
        id: character.id,
        disabled: !canDrag
    });
    const buttonRef = useRef(null);


    const style = isOverlay
        ? { opacity: 0.95, pointerEvents: 'none' }
        : (transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined);

    const isEnemy = character.basicInfo?.type === 'enemy';
    const isDragging = character.id === activeId && !isOverlay;
    const isOtherPlayer = isMultiplayer && !isOwnCharacter;
    const hasCustomAvatar = character.basicInfo?.avatar && character.basicInfo.avatar.startsWith('/avatars/');
    const characterEntryClass = `character-entry${isEnemy ? " enemy" : ""} ${isDragging ? 'dragging' : ''} ${isOtherPlayer ? 'other-player' : ''} ${hasCustomAvatar ? 'has-custom-avatar' : ''}`;

    return (
        <div className="character-wrapper"
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
                <div className="drag-handle" {...(canDrag ? { ...attributes, ...listeners } : {})}>
                    <Avatar key={character.basicInfo?.avatar || 'default'} src={character.basicInfo?.avatar} />
                </div>
                <span className="character-name">{character.basicInfo?.name}</span>
            </div>
        </div>
    );
}

export default Character;