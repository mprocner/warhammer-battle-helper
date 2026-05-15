import React from 'react';
import { useTranslation } from 'react-i18next';
import { getSystem } from '../systems/registry';

function CharacterDetailsPanel({
    character,
    onCharacterUpdate,
    addLogMessage,
    gameId = null,
    token = null,
    isGM = false,
    gameSystem = 'warhammer4e',
    autoOpenSheet = false,
    onSheetOpened = null,
    rollVisibility = 'all',
    game = null,
}) {
    const { t } = useTranslation();
    const system = getSystem(gameSystem);

    if (!character) {
        return (
            <div className="character-details empty">
                <h2>{t('character.selectCharacter')}</h2>
                <p className="empty-hint">{t('character.selectCharacterHint')}</p>
            </div>
        );
    }

    if (system.CharacterDetails) {
        const SystemCharacterDetails = system.CharacterDetails;
        return (
            <SystemCharacterDetails
                character={character}
                onCharacterUpdate={onCharacterUpdate}
                addLogMessage={addLogMessage}
                gameId={gameId}
                token={token}
                isGM={isGM}
                gameSystem={gameSystem}
                autoOpenSheet={autoOpenSheet}
                onSheetOpened={onSheetOpened}
                rollVisibility={rollVisibility}
                game={game}
            />
        );
    }

    return null;
}

export default CharacterDetailsPanel;
