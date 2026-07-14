import React from 'react';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../api/axios';
import { buildPayload } from '../utils/buildPayload';
import { getSystem } from '../systems/registry';
import { resolveIcon } from '../utils/tokenIcons';

function CharacterStates({ character, onCharacterUpdate, saveUrl }) {
    const { t } = useTranslation();
    // Conditions come from the character's game system (single source of truth); systems
    // without a condition catalog (e.g. CoC) simply render no toggles.
    const STATES = getSystem(character?.gameSystem).states || [];

    // Left click bumps the level up, right click bumps it down — mirroring the token overlay
    // (TokenOverlay.jsx bumpState). A level dropping to 0 removes the condition entirely.
    const bumpStateLevel = async (stateName, delta) => {
        const currentStates = character.states || [];
        const existing = currentStates.find(s => s.name === stateName);

        let newStates;
        if (existing) {
            const newLevel = existing.level + delta;
            newStates = newLevel <= 0
                ? currentStates.filter(s => s.name !== stateName)
                : currentStates.map(s => s.name === stateName ? { ...s, level: newLevel } : s);
        } else {
            if (delta <= 0) return; // nothing to decrement on an inactive condition
            newStates = [...currentStates, { name: stateName, level: 1 }];
        }

        const updatedCharacter = { ...character, states: newStates };
        onCharacterUpdate(updatedCharacter);

        try {
            await axiosInstance.put(saveUrl, buildPayload(updatedCharacter));
        } catch (error) {
            console.error('Error saving state change:', error);
        }
    };

    return (
        <div className="states-container">
            <div className="states-label">{t('conditions.label')}</div>
            <div className="states-grid">
                {STATES.map((state) => {
                    const active = (character.states || []).find(s => s.name === state.key);
                    const IconComponent = resolveIcon(state.icon);
                    return (
                        <div
                            key={state.key}
                            className={`state-icon ${active ? 'active' : ''}`}
                            data-state={state.key.toLowerCase()}
                            onClick={() => bumpStateLevel(state.key, +1)}
                            onContextMenu={(e) => { e.preventDefault(); bumpStateLevel(state.key, -1); }}
                        >
                            {IconComponent && <IconComponent sx={{ fontSize: 18 }} />}
                            {active && active.level > 1 && (
                                <span className="state-icon__level">{active.level}</span>
                            )}
                            <span className="state-tooltip">
                                <span className="state-tooltip-arrow" />
                                {t(state.labelKey)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default CharacterStates;
