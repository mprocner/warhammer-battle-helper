import React, {useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {useDraggable} from '@dnd-kit/core';
import CharacterAttackButton from './buttons/CharacterAttackButton';
import Avatar from './Avatar';

function Character({
        currentZone, 
        fightZones, 
        onFightComplete, 
        addLogMessage,
        character,
        activeId, isOverlay = false,
        isHighlighted = false, highlightPossibleTargets, clearHighlightedTargets,
        setCurrentAttacker, 
        setCurrentDefender
    }) {
    
    console.log('Rendering Character:', character?.basicInfo?.name, 'in zone:', currentZone);
    const {attributes, listeners, setNodeRef, transform} = useDraggable({ id: character.id });
    const buttonRef = useRef(null);
    const [showActionButtons, setShowActionButtons] = useState(false);
    const [showMoreButton, setShowMoreButton] = useState(false);


    const style = isOverlay
        ? { opacity: 0.95, pointerEvents: 'none' }
        : (transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined);

    const isEnemy = character.basicInfo?.type === 'enemy';
    const isDragging = character.id === activeId && !isOverlay;
    const characterEntryClass = `character-entry${isEnemy ? " enemy" : ""} ${isDragging ? 'dragging' : ''}`;
    const [showDetails, setShowDetails] = useState(false);

    // Modal portal
    const modalContent = showDetails && createPortal(
        <div className="char-modal-overlay" onClick={() => setShowDetails(false)}>
            <div className="char-modal" onClick={e => e.stopPropagation()}>
                <div className="char-modal-header">
                    <h4>{character.basicInfo?.name}</h4>
                    <button className="close-btn" onClick={() => setShowDetails(false)}>×</button>
                </div>
                <pre className="char-json">
{JSON.stringify(character, null, 2)}
                </pre>
            </div>
        </div>,
        document.body
    );

    // attack button
    const targetButton = isHighlighted ? (
        <button className='target-btn'
            onClick={(e) => {
                e.stopPropagation();
                setCurrentDefender(character);
            }}
        >
            <img src="/img/attack.png" alt="Target" draggable="false" />
        </button>
    ) : null;

    // Przyciski portal (poza kratką)
    const actionButtons = currentZone?.id && showActionButtons && !isOverlay && (
        <div className="grid-action-buttons">
            <button
                className="details-btn icon-btn"
                title="Szczegóły"
                onClick={(e) => {
                    e.stopPropagation();
                    setShowDetails(true);
                    setShowActionButtons(false);
                }}
            >
                <img src="/img/view.png" alt="Details" />
            </button>
            <CharacterAttackButton
                characterId={character.id}
                currentZone={currentZone}
                fightZones={fightZones}
                onFightComplete={onFightComplete}
                addLogMessage={addLogMessage}
                attackerModifier={character.modifier || 0}
                highlightPossibleTargets={highlightPossibleTargets}
                clearHighlightedTargets={clearHighlightedTargets}
                isHighlighted={isHighlighted}
                setCurrentAttacker={setCurrentAttacker}
                setCurrentDefender={setCurrentDefender}
            />
        </div>
    );

    const moreButton = currentZone?.id && showMoreButton && (
        <button 
            onClick={() => currentZone?.id && setShowActionButtons(!showActionButtons)}
            className='more-btn icon-btn'>
            <img src="/img/icon-more.png" alt="More" />
        </button>

    );


    return (
        <div className={"character-wrapper" + (isHighlighted ? ' possible-target' : '')}
            onMouseEnter={() => {
                setShowMoreButton(true);
            }}
            onMouseLeave={() => {
                setShowMoreButton(false);
            }}
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
                {currentZone?.id ? (
                    <div className="drag-handle" {...attributes} {...listeners}>
                        <Avatar src={character.basicInfo?.avatar} />
                    </div>
                ) : (
                    <>
                        <div className="drag-handle" {...attributes} {...listeners}>
                            <Avatar src={character.basicInfo?.avatar} />
                        </div>
                        <span className="character-name">{character.basicInfo?.name}</span>
                        {!isOverlay && (
                            <div className="inline-buttons">
                                <button
                                    className="details-btn icon-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowDetails(true);
                                    }}
                                >
                                    <img src="/img/view.png" alt="Details" />
                                </button>
                            </div>
                        )}
                    </>
                )}
                {moreButton}
            </div>
            {targetButton}
            {modalContent}
            {actionButtons}
        </div>
    );
}

export default Character;