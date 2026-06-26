import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import ModifierSelectionModal from './ModifierSelectionModal';
import CharacterStates from '../../components/CharacterStates';
import CharacterHeader from '../shared/CharacterHeader';
import axios from 'axios';
import axiosInstance, { getApiUrl, getApiHeaders } from '../../api/axios';
import skillsData from '../../data/skills.json';
import { buildPayload } from './buildPayload';
import { getCharacterSaveUrl } from '../shared/characterApi';

function WarhammerCharacterDetails({
    character,
    onCharacterUpdate,
    addLogMessage,
    gameId = null,
    token = null,
    isGM = false,
    onOpenCharacterSheet = null,
    rollVisibility = 'all',
}) {
    const { t } = useTranslation();
    const [showModifierModal, setShowModifierModal] = useState(false);
    const [mousePosition, setMousePosition] = useState(null);
    const [pendingCharacteristic, setPendingCharacteristic] = useState(null);
    const woundsSaveTimerRef = useRef(null);

    // Initialize wounds.current to wounds.total if not set
    useEffect(() => {
        if (character && character.wounds?.total != null && character.wounds?.current == null) {
            const updatedCharacter = {
                ...character,
                wounds: {
                    ...character.wounds,
                    current: character.wounds.total || 0
                }
            };
            axiosInstance.put(getCharacterSaveUrl(updatedCharacter.id, gameId), updatedCharacter).catch((error) => {
                console.error('Error initializing wounds.current:', error);
            });
            onCharacterUpdate(updatedCharacter);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [character?.id]);

    const getSkillAdvances = (character, skillKey) => {
        if (character.basicSkills?.[skillKey] !== undefined) {
            return parseInt(character.basicSkills[skillKey]) || 0;
        }
        if (character.advancedSkills?.[skillKey] !== undefined) {
            return parseInt(character.advancedSkills[skillKey]) || 0;
        }
        return 0;
    };

    // Get favorite weapons with their calculated skill values
    const favoriteWeapons = useMemo(() => {
        if (!character || !character.weapons || character.weapons.length === 0) {
            return [];
        }

        const stats = character.characteristics?.current || {};

        return character.weapons
            .filter(weapon => weapon.isFavourite)
            .map(weapon => {
                const weaponSkill = weapon.skill;
                if (!weaponSkill) return null;

                const isMelee = weaponSkill.startsWith('MELEE');
                const isRanged = weaponSkill.startsWith('RANGED');
                const characteristicValue = isMelee ? (stats.WS || 0) : isRanged ? (stats.BS || 0) : 0;
                const advances = getSkillAdvances(character, weaponSkill);
                const skillValue = characteristicValue + advances;

                return {
                    name: weapon.name,
                    skill: weaponSkill,
                    damage: weapon.damage,
                    value: skillValue,
                    isMelee,
                    isRanged
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [character]);

    // Get favorite skills with their calculated values
    const favoriteSkills = useMemo(() => {
        if (!character || !character.favoriteSkills || character.favoriteSkills.length === 0) {
            return [];
        }

        const stats = character.characteristics?.current || {};

        const charMapping = {
            'WEAPON_SKILL': 'WS', 'BALLISTIC_SKILL': 'BS', 'STRENGTH': 'S',
            'TOUGHNESS': 'T', 'INITIATIVE': 'I', 'AGILITY': 'Ag',
            'DEXTERITY': 'Dex', 'INTELLIGENCE': 'Int', 'WILLPOWER': 'WP', 'FELLOWSHIP': 'Fel'
        };

        return character.favoriteSkills.map(skillKey => {
            if (skillKey.startsWith('CUSTOM_')) {
                const customSkill = character.customSkills?.find(cs => cs.key === skillKey);
                if (!customSkill) return null;

                const advances = getSkillAdvances(character, skillKey);
                const characteristicValue = stats[charMapping[customSkill.characteristic] || 'WS'] || 0;
                const skillValue = characteristicValue + advances;

                return {
                    key: skillKey,
                    skillKey: skillKey,
                    name: customSkill.name,
                    value: skillValue,
                    characteristic: customSkill.characteristic
                };
            }

            const exactMatch = skillsData.find(s => s.key === skillKey);
            const isCompound = !exactMatch && skillKey.includes('_');

            if (isCompound) {
                const [parentKey, spec] = skillKey.split('_');
                const skill = skillsData.find(s => s.key === parentKey);
                if (!skill) return null;

                const advances = getSkillAdvances(character, skillKey);
                const characteristicValue = stats[charMapping[skill.characteristic] || 'Fel'] || 0;
                const skillValue = characteristicValue + advances;

                return {
                    key: skillKey,
                    skillKey: skillKey,
                    name: `${t(`skills:${parentKey}.name`)} (${t(`skills:${parentKey}.specialisations.${spec}`)})`,
                    value: skillValue,
                    characteristic: skill.characteristic
                };
            } else {
                const skill = skillsData.find(s => s.key === skillKey);
                if (!skill) return null;

                const advances = getSkillAdvances(character, skillKey);
                const characteristicValue = stats[charMapping[skill.characteristic] || 'Fel'] || 0;
                const skillValue = characteristicValue + advances;

                return {
                    key: skillKey,
                    skillKey: skillKey,
                    name: t(`skills:${skillKey}.name`),
                    value: skillValue,
                    characteristic: skill.characteristic
                };
            }
        }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    }, [character, t]);

    const handleWeaponClick = (weapon, event) => {
        if (!weapon.value || weapon.value === '-') {
            if (addLogMessage) {
                addLogMessage(t('combat.cannotRoll', { characteristic: weapon.name }), 'warning');
            }
            return;
        }

        setPendingCharacteristic({
            name: weapon.name,
            value: weapon.value,
            weaponSkill: weapon.skill,
            weaponDamage: weapon.damage,
            isWeapon: true
        });
        setMousePosition({ x: event.clientX, y: event.clientY });
        setShowModifierModal(true);
    };

    const handleSkillClick = (skill, event) => {
        if (!skill.value || skill.value === '-') {
            if (addLogMessage) {
                addLogMessage(t('combat.cannotRoll', { characteristic: skill.name }), 'warning');
            }
            return;
        }

        setPendingCharacteristic({
            name: skill.name,
            value: skill.value,
            skillKey: skill.skillKey,
            isSkill: true
        });
        setMousePosition({ x: event.clientX, y: event.clientY });
        setShowModifierModal(true);
    };

    const stats = character.characteristics?.current || {};
    const hp = character.wounds || {};
    const fate = character.fate || {};

    const adjustFortune = async (amount) => {
        const currentFortune = Number(fate.fortune) || 0;
        const newFortune = Math.max(0, currentFortune + amount);
        const updatedCharacter = {
            ...character,
            fate: {
                ...fate,
                fortune: newFortune
            }
        };

        try {
            await axiosInstance.put(getCharacterSaveUrl(updatedCharacter.id, gameId), buildPayload(updatedCharacter));
        } catch (error) {
            console.error('Error saving fortune change:', error);
            if (addLogMessage) {
                addLogMessage(t('combat.saveFortuneFailed'), 'error');
            }
        }

        onCharacterUpdate(updatedCharacter);
    };

    const handleWoundsChange = (newValue) => {
        const max = hp.total || 0;
        const clamped = Math.max(0, Math.min(max, Number(newValue) || 0));

        const updatedCharacter = {
            ...character,
            wounds: {
                ...character.wounds,
                current: clamped
            }
        };

        onCharacterUpdate(updatedCharacter);

        if (woundsSaveTimerRef.current) {
            clearTimeout(woundsSaveTimerRef.current);
        }

        woundsSaveTimerRef.current = setTimeout(async () => {
            try {
                await axiosInstance.put(getCharacterSaveUrl(updatedCharacter.id, gameId), buildPayload(updatedCharacter));
            } catch (error) {
                console.error('Error saving wounds:', error);
                if (addLogMessage) {
                    addLogMessage(t('combat.saveWoundsFailed'), 'error');
                }
            }
        }, 1000);
    };

    const handleCharacteristicClick = (charName, charValue, event) => {
        if (!charValue || charValue === '-') {
            if (addLogMessage) {
                addLogMessage(t('combat.cannotRoll', { characteristic: charName }), 'warning');
            }
            return;
        }

        setPendingCharacteristic({ name: charName, value: charValue, skillKey: `attr_${charName}`, isSkill: true });
        setMousePosition({ x: event.clientX, y: event.clientY });
        setShowModifierModal(true);
    };

    const handleModifierConfirm = (selectedModifier) => {
        setShowModifierModal(false);
        if (pendingCharacteristic) {
            if (pendingCharacteristic.isWeapon) {
                rollWeapon(
                    pendingCharacteristic.name,
                    pendingCharacteristic.weaponSkill,
                    pendingCharacteristic.weaponDamage,
                    selectedModifier
                );
            } else if (pendingCharacteristic.isSkill) {
                rollSkill(
                    pendingCharacteristic.skillKey,
                    pendingCharacteristic.name,
                    selectedModifier
                );
            } else {
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
            const sides = 100;

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
                        attributeModifier: modifierValue,
                        visibility: rollVisibility
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to roll dice');
                }
            } else {
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
                        characterId: character.id,
                        visibility: rollVisibility
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to roll skill');
                }
            } else {
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

    const rollWeapon = async (weaponName, weaponSkill, weaponDamage, modifierValue) => {
        try {
            if (gameId && token) {
                const response = await fetch(`${getApiUrl()}/games/${gameId}/rollWeapon`, {
                    method: 'POST',
                    headers: getApiHeaders({
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }),
                    body: JSON.stringify({
                        weaponName: weaponName,
                        weaponSkill: weaponSkill,
                        damage: weaponDamage || '',
                        modifier: modifierValue,
                        characterId: character.id,
                        visibility: rollVisibility
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to roll weapon');
                }
            } else {
                if (addLogMessage) {
                    addLogMessage('Weapon rolls are only available in game sessions', 'warning');
                }
            }
        } catch (error) {
            console.error('Error rolling weapon:', error);
            if (addLogMessage) {
                addLogMessage(t('combat.rollFailed'), 'error');
            }
        }
    };

    return (
        <div className="character-details">
            <CharacterHeader
                avatarSrc={character.avatar}
                characterId={character.id}
                name={character.basicInfo?.name}
                onOpenSheet={() => onOpenCharacterSheet?.(character.id)}
                t={t}
            />

            <CharacterStates
                character={character}
                onCharacterUpdate={onCharacterUpdate}
                saveUrl={getCharacterSaveUrl(character.id, gameId)}
            />

            <div className="detail-grid">
                <div className="detail-item">
                    <div className="detail-label">{t('attributes.hp')}</div>
                    <div className="detail-value modifier-value">
                        <input
                            type="number"
                            className="wounds-input"
                            min={0}
                            max={hp.total || 0}
                            value={hp.current != null ? hp.current : (hp.total || 0)}
                            onChange={(e) => handleWoundsChange(e.target.value)}
                        />
                        &nbsp;/ {hp.total || '-'}
                    </div>
                </div>
                <div className="detail-item">
                    <div className="detail-label">{t('attributes.fortune')}</div>
                    <div className="modifier-input-container">
                        <button className="modifier-btn" onClick={() => adjustFortune(-1)}>-1</button>
                        <span className="modifier-value">
                            {fate.fortune ?? 0}
                        </span>
                        <button className="modifier-btn" onClick={() => adjustFortune(1)}>+1</button>
                    </div>
                </div>
            </div>

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

            {favoriteWeapons.length > 0 && (
                <div className="favorite-skills">
                    <div className="favorite-skills-label">⚔️ {t('favoriteWeapons')}</div>
                    <div className="favorite-skills-grid">
                        {favoriteWeapons.map((weapon, idx) => (
                            <button
                                key={`weapon-${idx}`}
                                className="skill-box skill-box-button"
                                onClick={(e) => handleWeaponClick(weapon, e)}
                                title={t('combat.rollTest', { characteristic: weapon.name })}
                                disabled={!weapon.value || weapon.value === '-'}
                            >
                                <div className="skill-box-label">{weapon.name}</div>
                                <div className="skill-box-value">{weapon.value || '-'}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {favoriteSkills.length > 0 && (
                <div className="favorite-skills">
                    <div className="favorite-skills-label">⭐ {t('favoriteSkills')}</div>
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

export default WarhammerCharacterDetails;
