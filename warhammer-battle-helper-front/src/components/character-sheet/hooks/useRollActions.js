import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { getApiUrl, getApiHeaders } from '../../../api/axios';

function useRollActions(gameId, token, characterId, characterName, addLogMessage) {
    const { t } = useTranslation();
    const [showModifierModal, setShowModifierModal] = useState(false);
    const [mousePosition, setMousePosition] = useState(null);
    const [pendingRoll, setPendingRoll] = useState(null);

    const rollSkill = useCallback(async (skillKey, skillName, modifierValue) => {
        if (!gameId || !token) {
            if (addLogMessage) {
                addLogMessage('Skill rolls are only available in game sessions', 'warning');
            }
            return;
        }

        try {
            const response = await fetch(`${getApiUrl()}/games/${gameId}/rollSkill`, {
                method: 'POST',
                headers: getApiHeaders({
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }),
                body: JSON.stringify({
                    skill: skillKey,
                    modifier: modifierValue,
                    characterId
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to roll skill');
            }
        } catch (error) {
            console.error('Error rolling skill:', error);
            if (addLogMessage) {
                addLogMessage(t('combat.rollFailed'), 'error');
            }
        }
    }, [gameId, token, characterId, addLogMessage, t]);

    const rollCharacteristic = useCallback(async (charName, charValue, modifierValue) => {
        const sides = 100;

        try {
            if (gameId && token) {
                const response = await fetch(`${getApiUrl()}/games/${gameId}/roll`, {
                    method: 'POST',
                    headers: getApiHeaders({
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }),
                    body: JSON.stringify({
                        sides,
                        characterId,
                        attribute: charName,
                        attributeModifier: modifierValue
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to roll dice');
                }
            } else {
                const modifiedValue = charValue + modifierValue;
                const response = await axios.post(`${getApiUrl()}/roll`, { sides }, { withCredentials: true });
                const rollResult = response.data.result;
                const successLevel = Math.floor(modifiedValue / 10) - Math.floor(rollResult / 10);
                const success = rollResult <= modifiedValue;

                if (addLogMessage) {
                    const successText = success
                        ? t('combat.success', { level: successLevel })
                        : t('combat.failure', { level: successLevel });
                    const modifierText = modifierValue !== 0 ? ` (${modifierValue > 0 ? '+' : ''}${modifierValue})` : '';
                    addLogMessage(
                        `${characterName} - ${charName}${modifierText} Test: Rolled ${rollResult} vs ${modifiedValue} - ${successText}`,
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
    }, [gameId, token, characterId, characterName, addLogMessage, t]);

    const handleCharacteristicClick = useCallback((charName, charValue, event) => {
        if (!charValue || charValue === '-') {
            if (addLogMessage) {
                addLogMessage(t('combat.cannotRoll', { characteristic: charName }), 'warning');
            }
            return;
        }
        setPendingRoll({ name: charName, skillKey: `attr_${charName}`, value: charValue, isSkill: true });
        setMousePosition({ x: event.clientX, y: event.clientY });
        setShowModifierModal(true);
    }, [addLogMessage, t]);

    const handleSkillClick = useCallback((skillName, skillKey, skillValue, event) => {
        if (!skillValue || skillValue === '-') {
            if (addLogMessage) {
                addLogMessage(t('combat.cannotRoll', { characteristic: skillName }), 'warning');
            }
            return;
        }
        setPendingRoll({ name: skillName, skillKey, value: skillValue, isSkill: true });
        setMousePosition({ x: event.clientX, y: event.clientY });
        setShowModifierModal(true);
    }, [addLogMessage, t]);

    const handleModifierConfirm = useCallback((selectedModifier) => {
        setShowModifierModal(false);
        if (pendingRoll) {
            if (pendingRoll.isSkill) {
                rollSkill(pendingRoll.skillKey, pendingRoll.name, selectedModifier);
            } else {
                rollCharacteristic(pendingRoll.name, pendingRoll.value, selectedModifier);
            }
        }
        setPendingRoll(null);
    }, [pendingRoll, rollSkill, rollCharacteristic]);

    const handleModifierCancel = useCallback(() => {
        setShowModifierModal(false);
        setPendingRoll(null);
    }, []);

    return {
        showModifierModal,
        mousePosition,
        handleCharacteristicClick,
        handleSkillClick,
        handleModifierConfirm,
        handleModifierCancel
    };
}

export default useRollActions;
