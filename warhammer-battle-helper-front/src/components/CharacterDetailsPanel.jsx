import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import CharacterSheetPopup from './CharacterSheetPopup';
import ModifierSelectionModal from './ModifierSelectionModal';
import Avatar from './Avatar';
import axios from 'axios';
import axiosInstance, { getApiUrl, getApiHeaders } from '../api/axios';
import skillsData from '../data/skills.json';

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

    // Get favorite skills with their calculated values
    const favoriteSkills = useMemo(() => {
        if (!character || !character.favoriteSkills || character.favoriteSkills.length === 0) {
            return [];
        }

        const stats = character.characteristics?.current || {};

        return character.favoriteSkills.map(skillKey => {
            // Check if it's a compound key (e.g., MELEE_BASIC, STEALTH_RURAL)
            const isCompound = skillKey.includes('_');

            if (isCompound) {
                const [parentKey, spec] = skillKey.split('_');
                const skill = skillsData.find(s => s.key === parentKey);
                if (!skill) return null;

                const advances = parseInt(character.basicSkills?.[skillKey]) || 0;
                const characteristicValue = stats[skill.characteristic === 'WEAPON_SKILL' ? 'WS' :
                    skill.characteristic === 'BALLISTIC_SKILL' ? 'BS' :
                    skill.characteristic === 'STRENGTH' ? 'S' :
                    skill.characteristic === 'TOUGHNESS' ? 'T' :
                    skill.characteristic === 'INITIATIVE' ? 'I' :
                    skill.characteristic === 'AGILITY' ? 'Ag' :
                    skill.characteristic === 'DEXTERITY' ? 'Dex' :
                    skill.characteristic === 'INTELLIGENCE' ? 'Int' :
                    skill.characteristic === 'WILLPOWER' ? 'WP' : 'Fel'] || 0;
                const skillValue = characteristicValue + advances;

                return {
                    key: skillKey,
                    skillKey: skillKey, // Store the actual skill key for API call
                    name: `${t(`skills:${parentKey}.name`)} (${t(`skills:${parentKey}.specialisations.${spec}`)})`,
                    value: skillValue,
                    characteristic: skill.characteristic
                };
            } else {
                // Basic or advanced skill
                const skill = skillsData.find(s => s.key === skillKey);
                if (!skill) return null;

                const advances = skill.type === 'basic'
                    ? (parseInt(character.basicSkills?.[skillKey]) || 0)
                    : (parseInt(character.advancedSkills?.[skillKey]) || 0);

                const characteristicValue = stats[skill.characteristic === 'WEAPON_SKILL' ? 'WS' :
                    skill.characteristic === 'BALLISTIC_SKILL' ? 'BS' :
                    skill.characteristic === 'STRENGTH' ? 'S' :
                    skill.characteristic === 'TOUGHNESS' ? 'T' :
                    skill.characteristic === 'INITIATIVE' ? 'I' :
                    skill.characteristic === 'AGILITY' ? 'Ag' :
                    skill.characteristic === 'DEXTERITY' ? 'Dex' :
                    skill.characteristic === 'INTELLIGENCE' ? 'Int' :
                    skill.characteristic === 'WILLPOWER' ? 'WP' : 'Fel'] || 0;
                const skillValue = characteristicValue + advances;

                return {
                    key: skillKey,
                    skillKey: skillKey, // Store the actual skill key for API call
                    name: t(`skills:${skillKey}.name`),
                    value: skillValue,
                    characteristic: skill.characteristic
                };
            }
        }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    }, [character, t]);

    const handleSkillClick = (skill, event) => {
        if (!skill.value || skill.value === '-') {
            if (addLogMessage) {
                addLogMessage(t('combat.cannotRoll', { characteristic: skill.name }), 'warning');
            }
            return;
        }

        // Store pending skill (not characteristic) and show modifier modal
        setPendingCharacteristic({
            name: skill.name,
            value: skill.value,
            skillKey: skill.skillKey,
            isSkill: true // Flag to indicate this is a skill, not a characteristic
        });
        setMousePosition({ x: event.clientX, y: event.clientY });
        setShowModifierModal(true);
    };

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
            if (pendingCharacteristic.isSkill) {
                // Roll skill
                rollSkill(
                    pendingCharacteristic.skillKey,
                    pendingCharacteristic.name,
                    selectedModifier
                );
            } else {
                // Roll characteristic
                rollCharacteristic(
                    pendingCharacteristic.name,
                    pendingCharacteristic.value,
                    selectedModifier
                );
            }
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

    const rollSkill = async (skillKey, skillName, modifierValue) => {
        try {
            // Skill rolls are only supported in game sessions
            if (gameId && token) {
                const response = await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, {
                    method: 'POST',
                    headers: getApiHeaders({
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }),
                    body: JSON.stringify({
                        skill: skillKey,
                        modifier: modifierValue,
                        characterId: character.id
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to roll skill');
                }

                // WebSocket will handle broadcasting the message with skill details
                // Backend calculates skill value from database (server-authoritative)
            } else {
                // If not in a game session, show a warning
                if (addLogMessage) {
                    addLogMessage('Skill rolls are only available in game sessions', 'warning');
                }
            }
        } catch (error) {
            console.error('Error rolling skill:', error);
            if (addLogMessage) {
                addLogMessage(t('combat.rollFailed'), 'error');
            }
        }
    };

    return (
        <div className="character-details">
            <div className="character-details-header">
                <Avatar key={`${character.id}-${character.basicInfo?.avatar || 'default'}`} src={character.basicInfo?.avatar} />
                <h2>{character.basicInfo?.name || 'Unknown'}</h2>
            </div>

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

            {/* Favorite Skills */}
            {favoriteSkills.length > 0 && (
                <div className="favorite-skills">
                    <div className="favorite-skills-label">⭐ Favorite Skills</div>
                    <div className="favorite-skills-grid">
                        {favoriteSkills.map((skill) => (
                            <button
                                key={skill.key}
                                className="skill-box skill-box-button"
                                onClick={(e) => handleSkillClick(skill, e)}
                                title={t('combat.rollTest', { characteristic: skill.name })}
                                disabled={!skill.value || skill.value === '-'}
                            >
                                <div className="skill-box-label">{skill.name}</div>
                                <div className="skill-box-value">{skill.value || '-'}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {showDetails && (
                <CharacterSheetPopup
                    character={character}
                    onClose={() => setShowDetails(false)}
                    onCharacterUpdate={onCharacterUpdate}
                    addLogMessage={addLogMessage}
                    gameId={gameId}
                    token={token}
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