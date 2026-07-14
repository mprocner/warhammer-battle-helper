import React, {useRef} from 'react';
import {useDraggable} from '@dnd-kit/core';
import Avatar from './Avatar';
import TokenOverlay from './token-display/TokenOverlay';

function Character({
        currentZone,
        character,
        activeId, isOverlay = false,
        isOwnCharacter = true,
        isMultiplayer = false,
        tokenDisplay = null,
        selected = false,
        canEditToken = false,
        gameId = null,
        token = null,
    }) {

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

    // For Warhammer, basicInfo.name is authoritative (edited in sheet); name is fallback for CoC
    const displayName = character.basicInfo?.name || character.name;
    const displayAvatar = character.avatar || character.basicInfo?.avatar;
    const isEnemy = character.basicInfo?.type === 'enemy' || (character.isNPC && !character.basicInfo);
    const isDragging = character.id === activeId && !isOverlay;
    const isOtherPlayer = isMultiplayer && !isOwnCharacter;
    const hasCustomAvatar = displayAvatar && displayAvatar.startsWith('/avatars/');
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
                    <Avatar key={displayAvatar || 'default'} src={displayAvatar} />
                </div>
                <span className="character-name">{displayName}</span>
            </div>
            {tokenDisplay && currentZone?.id && !isOverlay && (
                <TokenOverlay
                    character={character}
                    config={tokenDisplay}
                    selected={selected}
                    canEditToken={canEditToken}
                    canEdit={canEditToken}
                    gameId={gameId}
                    token={token}
                />
            )}
        </div>
    );
}

export default Character;