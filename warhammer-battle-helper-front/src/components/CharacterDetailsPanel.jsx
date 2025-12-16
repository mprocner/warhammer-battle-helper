import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CharacterSheetPopup from './CharacterSheetPopup';
import ModifierSelectionModal from './ModifierSelectionModal';
import axios from 'axios';
import axiosInstance, { getApiUrl, getApiHeaders } from '../api/axios';

function CharacterDetailsPanel({
    character,
    onAttack,
    onCharacterUpdate,
    modifier,
    onFortuneChange,
    addLogMessage,
    gameId = null,
    token = null
}) {
    const { t } = useTranslation();
    const [showDetails, setShowDetails] = useState(false);
    const [showModifierModal, setShowModifierModal] = useState(false);
    const [mousePosition, setMousePosition] = useState(null);
    const [pendingCharacteristic, setPendingCharacteristic] = useState(null);

    if (!character) {
        return (
            <div className="character-details empty">
                <h2>{t('character.selectCharacter')}</h2>
                <p className="empty-hint">{t('character.selectCharacterHint')}</p>
            </div>
        );
    }

    const stats = character.characteristics?.current || {};
    const hp = character.secondaryAttributes?.wounds || {};
    const movement = character.secondaryAttributes?.movement?.current || 4;

    const adjustFortune = async (amount) => {
        const currentFortune = Number(character.fate.fortune) || 0;
        const newFortune = Math.max(0, currentFortune + amount);
        console.log(`Adjusting fortune by ${amount}: ${newFortune}, current: ${character.fate.fortune}`);
        const updatedCharacter = {
            ...character,
            fate: {
                ...character.fate,
                fortune: newFortune
            }
        };

        // Save to backend
        try {
            await axiosInstance.put(`/characters/${updatedCharacter.id}`, updatedCharacter);
            console.log('Fortune updated and saved');
        } catch (error) {
            console.error('Error saving fortune change:', error);
            if (addLogMessage) {
                addLogMessage(t('combat.saveFortuneFailed'), 'error');
            }
        }

        // Update local state
        onCharacterUpdate(updatedCharacter);
    };

    const getModifierClass = () => {
        if (modifier > 0) return 'positive';
        if (modifier < 0) return 'negative';
        return '';
    };

    const handleCharacteristicClick = (charName, charValue, event) => {
        if (!charValue || charValue === '-') {
            if (addLogMessage) {
                addLogMessage(t('combat.cannotRoll', { characteristic: charName }), 'warning');
            }
            return;
        }

        // Store pending characteristic and show modifier modal
        setPendingCharacteristic({ name: charName, value: charValue });
        setMousePosition({ x: event.clientX, y: event.clientY });
        setShowModifierModal(true);
    };

    const handleModifierConfirm = (selectedModifier) => {
        setShowModifierModal(false);
        if (pendingCharacteristic) {
            rollCharacteristic(
                pendingCharacteristic.name,
                pendingCharacteristic.value,
                selectedModifier
            );
        }
        setPendingCharacteristic(null);
    };

    const handleModifierCancel = () => {
        setShowModifierModal(false);
        setPendingCharacteristic(null);
    };

    const rollCharacteristic = async (charName, charValue, modifierValue) => {
        try {
            // Roll d100 for characteristic test
            const sides = 100;

            // If in a game session, use the game-specific endpoint
            if (gameId && token) {
                const response = await fetch(`${getApiUrl()}/games/${gameId}/roll`, {
                    method: 'POST',
                    headers: getApiHeaders({
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }),
                    body: JSON.stringify({
                        sides,
                        characterId: character.id,
                        attribute: charName,
                        attributeModifier: modifierValue
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to roll dice');
                }

                // WebSocket will handle broadcasting the message with characteristic details
                // Backend calculates modified value from database (server-authoritative)
            } else {
                // Fallback to single-player mode
                const modifiedValue = charValue + modifierValue;
                const response = await axios.post(`${getApiUrl()}/roll`, {
                    "sides": sides
                }, {
                    withCredentials: true
                });

                const rollResult = response.data.result;
                const successLevel = Math.floor(modifiedValue / 10) - Math.floor(rollResult / 10);
                const success = rollResult <= modifiedValue;

                if (addLogMessage) {
                    const successText = success
                        ? t('combat.success', { level: successLevel })
                        : t('combat.failure', { level: successLevel });
                    const modifierText = modifierValue !== 0 ? ` (${modifierValue > 0 ? '+' : ''}${modifierValue})` : '';
                    addLogMessage(
                        `${character.basicInfo?.name} - ${charName}${modifierText} Test: Rolled ${rollResult} vs ${modifiedValue} - ${successText}`,
                        success ? 'success' : 'error'
                    );
                }
            }
        } catch (error) {
            console.error('Error rolling characteristic:', error);
            if (addLogMessage) {
                addLogMessage(t('combat.rollFailed'), 'error');
            }
        }
    };

    return (
        <div className="character-details">
            <h2>{character.basicInfo?.name || 'Unknown'}</h2>

            {/* Action Buttons */}
            <div className="action-buttons">
                <button className="action-btn primary" onClick={onAttack} title={t('combat.attack')}>
                    <span className="action-btn-icon">⚔️</span>
                    <span className="action-btn-text">{t('combat.attack')}</span>
                </button>
                <button className="action-btn primary" title={t('combat.rangeAttack')}>
                    <span className="action-btn-icon">🏹</span>
                    <span className="action-btn-text">{t('combat.rangeAttack')}</span>
                </button>
                <button className="action-btn secondary" title={t('combat.castSpell')}>
                    <span className="action-btn-icon">✨</span>
                    <span className="action-btn-text">{t('combat.castSpell')}</span>
                </button>
                <button
                    className="action-btn"
                    onClick={() => setShowDetails(true)}
                    title={t('character.characterCard')}
                >
                    <span className="action-btn-icon">📜</span>
                    <span className="action-btn-text">{t('character.characterCard')}</span>
                </button>
            </div>

            {/* States/Conditions */}
            <div className="states-container">
                <div className="states-label">{t('conditions.label')}</div>
                <div className="states-grid">
                    <div className="state-icon" data-state="prone">
                        <span>🛏️</span>
                        <span className="state-tooltip">{t('conditions.prone')}</span>
                    </div>
                    <div className="state-icon" data-state="stunned">
                        <span>😵</span>
                        <span className="state-tooltip">{t('conditions.stunned')}</span>
                    </div>
                    <div className="state-icon" data-state="unconscious">
                        <span>😴</span>
                        <span className="state-tooltip">{t('conditions.unconscious')}</span>
                    </div>
                    <div className="state-icon" data-state="bleeding">
                        <span>🩸</span>
                        <span className="state-tooltip">{t('conditions.bleeding')}</span>
                    </div>
                    <div className="state-icon" data-state="poisoned">
                        <span>🧪</span>
                        <span className="state-tooltip">{t('conditions.poisoned')}</span>
                    </div>
                    <div className="state-icon" data-state="ablaze">
                        <span>🔥</span>
                        <span className="state-tooltip">{t('conditions.ablaze')}</span>
                    </div>
                </div>
            </div>

            {/* Detail Grid */}
            <div className="detail-grid">
                <div className="detail-item">
                    <div className="detail-label">{t('attributes.hp')}</div>
                    <div className="detail-value">{hp.current || '-'}/{hp.max || '-'}</div>
                </div>
                <div className="detail-item">
                    <div className="detail-label">{t('attributes.movement')}</div>
                    <div className="detail-value">{movement}</div>
                </div>
                <div className="detail-item">
                    <div className="detail-label">{t('attributes.fortune')}</div>
                    <div className="modifier-input-container">
                        <button className="modifier-btn" onClick={() => adjustFortune(-1)}>-1</button>
                        <span className={`modifier-value ${getModifierClass()}`}>
                            {character.fate.fortune}
                        </span>
                        <button className="modifier-btn" onClick={() => adjustFortune(1)}>+1</button>
                    </div>
                </div>
            </div>

            {/* Characteristics Mini */}
            <div className="characteristics-mini">
                <button
                    className="char-box char-box-button"
                    onClick={(e) => handleCharacteristicClick('WS', stats.WS, e)}
                    title={t('combat.rollTest', { characteristic: t('characteristicsShort.WEAPON_SKILL') })}
                    disabled={!stats.WS || stats.WS === '-'}
                >
                    <div className="char-box-label">{t('characteristicsShort.WEAPON_SKILL')}</div>
                    <div className="char-box-value">{stats.WS || '-'}</div>
                </button>
                <button
                    className="char-box char-box-button"
                    onClick={(e) => handleCharacteristicClick('BS', stats.BS, e)}
                    title={t('combat.rollTest', { characteristic: t('characteristicsShort.BALLISTIC_SKILL') })}
                    disabled={!stats.BS || stats.BS === '-'}
                >
                    <div className="char-box-label">{t('characteristicsShort.BALLISTIC_SKILL')}</div>
                    <div className="char-box-value">{stats.BS || '-'}</div>
                </button>
                <button
                    className="char-box char-box-button"
                    onClick={(e) => handleCharacteristicClick('S', stats.S, e)}
                    title={t('combat.rollTest', { characteristic: t('characteristicsShort.STRENGTH') })}
                    disabled={!stats.S || stats.S === '-'}
                >
                    <div className="char-box-label">{t('characteristicsShort.STRENGTH')}</div>
                    <div className="char-box-value">{stats.S || '-'}</div>
                </button>
                <button
                    className="char-box char-box-button"
                    onClick={(e) => handleCharacteristicClick('T', stats.T, e)}
                    title={t('combat.rollTest', { characteristic: t('characteristicsShort.TOUGHNESS') })}
                    disabled={!stats.T || stats.T === '-'}
                >
                    <div className="char-box-label">{t('characteristicsShort.TOUGHNESS')}</div>
                    <div className="char-box-value">{stats.T || '-'}</div>
                </button>
                <button
                    className="char-box char-box-button"
                    onClick={(e) => handleCharacteristicClick('I', stats.I, e)}
                    title={t('combat.rollTest', { characteristic: t('characteristicsShort.INITIATIVE') })}
                    disabled={!stats.I || stats.I === '-'}
                >
                    <div className="char-box-label">{t('characteristicsShort.INITIATIVE')}</div>
                    <div className="char-box-value">{stats.I || '-'}</div>
                </button>
                <button
                    className="char-box char-box-button"
                    onClick={(e) => handleCharacteristicClick('Ag', stats.Ag, e)}
                    title={t('combat.rollTest', { characteristic: t('characteristicsShort.AGILITY') })}
                    disabled={!stats.Ag || stats.Ag === '-'}
                >
                    <div className="char-box-label">{t('characteristicsShort.AGILITY')}</div>
                    <div className="char-box-value">{stats.Ag || '-'}</div>
                </button>
                <button
                    className="char-box char-box-button"
                    onClick={(e) => handleCharacteristicClick('Dex', stats.Dex, e)}
                    title={t('combat.rollTest', { characteristic: t('characteristicsShort.DEXTERITY') })}
                    disabled={!stats.Dex || stats.Dex === '-'}
                >
                    <div className="char-box-label">{t('characteristicsShort.DEXTERITY')}</div>
                    <div className="char-box-value">{stats.Dex || '-'}</div>
                </button>
                <button
                    className="char-box char-box-button"
                    onClick={(e) => handleCharacteristicClick('Int', stats.Int, e)}
                    title={t('combat.rollTest', { characteristic: t('characteristicsShort.INTELLIGENCE') })}
                    disabled={!stats.Int || stats.Int === '-'}
                >
                    <div className="char-box-label">{t('characteristicsShort.INTELLIGENCE')}</div>
                    <div className="char-box-value">{stats.Int || '-'}</div>
                </button>
                <button
                    className="char-box char-box-button"
                    onClick={(e) => handleCharacteristicClick('WP', stats.WP, e)}
                    title={t('combat.rollTest', { characteristic: t('characteristicsShort.WILLPOWER') })}
                    disabled={!stats.WP || stats.WP === '-'}
                >
                    <div className="char-box-label">{t('characteristicsShort.WILLPOWER')}</div>
                    <div className="char-box-value">{stats.WP || '-'}</div>
                </button>
                <button
                    className="char-box char-box-button"
                    onClick={(e) => handleCharacteristicClick('Fel', stats.Fel, e)}
                    title={t('combat.rollTest', { characteristic: t('characteristicsShort.FELLOWSHIP') })}
                    disabled={!stats.Fel || stats.Fel === '-'}
                >
                    <div className="char-box-label">{t('characteristicsShort.FELLOWSHIP')}</div>
                    <div className="char-box-value">{stats.Fel || '-'}</div>
                </button>
            </div>

            {showDetails && (
                <CharacterSheetPopup
                    character={character}
                    onClose={() => setShowDetails(false)}
                    onCharacterUpdate={onCharacterUpdate}
                    addLogMessage={addLogMessage}
                />
            )}

            {showModifierModal && (
                <ModifierSelectionModal
                    mousePosition={mousePosition}
                    onConfirm={handleModifierConfirm}
                    onCancel={handleModifierCancel}
                />
            )}
        </div>
    );
}

export default CharacterDetailsPanel;