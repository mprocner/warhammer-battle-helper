import React from 'react';
import Avatar from '../../components/Avatar';

function CharacterHeader({ avatarSrc, characterId, name, onOpenSheet, t }) {
    return (
        <div className="character-details-header">
            <Avatar key={`${characterId}-${avatarSrc || 'default'}`} src={avatarSrc} />
            <h2>{name || 'Unknown'}</h2>
            <button className="character-sheet-btn" onClick={onOpenSheet}>
                📜
                <span className="state-tooltip">
                    <span className="state-tooltip-arrow" />
                    {t('character.characterCard')}
                </span>
            </button>
        </div>
    );
}

export default CharacterHeader;
