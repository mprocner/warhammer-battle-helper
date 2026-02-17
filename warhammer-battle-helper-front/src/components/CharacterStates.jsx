import React from 'react';
import { useTranslation } from 'react-i18next';
import axiosInstance from '../api/axios';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import BloodtypeIcon from '@mui/icons-material/Bloodtype';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import HeartBrokenIcon from '@mui/icons-material/HeartBroken';
import HearingDisabledIcon from '@mui/icons-material/HearingDisabled';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import BatteryAlertIcon from '@mui/icons-material/BatteryAlert';
import SickIcon from '@mui/icons-material/Sick';
import HotelIcon from '@mui/icons-material/Hotel';
import ElectricBoltIcon from '@mui/icons-material/ElectricBolt';
import CrisisAlertIcon from '@mui/icons-material/CrisisAlert';
import BedtimeIcon from '@mui/icons-material/Bedtime';

const STATES = [
    { name: 'ABLAZE', icon: LocalFireDepartmentIcon, translationKey: 'ablaze' },
    { name: 'BLEEDING', icon: BloodtypeIcon, translationKey: 'bleeding' },
    { name: 'BLINDED', icon: VisibilityOffIcon, translationKey: 'blinded' },
    { name: 'BROKEN', icon: HeartBrokenIcon, translationKey: 'broken' },
    { name: 'DEAFENED', icon: HearingDisabledIcon, translationKey: 'deafened' },
    { name: 'ENTANGLED', icon: LinkOffIcon, translationKey: 'entangled' },
    { name: 'FATIGUED', icon: BatteryAlertIcon, translationKey: 'fatigued' },
    { name: 'POISON', icon: SickIcon, translationKey: 'poison' },
    { name: 'PRONE', icon: HotelIcon, translationKey: 'prone' },
    { name: 'STUNNED', icon: ElectricBoltIcon, translationKey: 'stunned' },
    { name: 'SURPRISED', icon: CrisisAlertIcon, translationKey: 'surprised' },
    { name: 'UNCONSCIOUS', icon: BedtimeIcon, translationKey: 'unconscious' },
];

function CharacterStates({ character, onCharacterUpdate, saveUrl }) {
    const { t } = useTranslation();

    const handleStateToggle = async (stateName) => {
        const currentStates = character.states || [];
        const exists = currentStates.some(s => s.name === stateName);
        const newStates = exists
            ? currentStates.filter(s => s.name !== stateName)
            : [...currentStates, { name: stateName, level: 1 }];

        const updatedCharacter = { ...character, states: newStates };
        onCharacterUpdate(updatedCharacter);

        try {
            await axiosInstance.put(saveUrl, updatedCharacter);
        } catch (error) {
            console.error('Error saving state change:', error);
        }
    };

    return (
        <div className="states-container">
            <div className="states-label">{t('conditions.label')}</div>
            <div className="states-grid">
                {STATES.map((state) => {
                    const isActive = (character.states || []).some(s => s.name === state.name);
                    const IconComponent = state.icon;
                    return (
                        <div
                            key={state.name}
                            className={`state-icon ${isActive ? 'active' : ''}`}
                            data-state={state.name.toLowerCase()}
                            onClick={() => handleStateToggle(state.name)}
                        >
                            <IconComponent sx={{ fontSize: 18 }} />
                            <span className="state-tooltip">
                                <span className="state-tooltip-arrow" />
                                {t(`conditions.${state.translationKey}`)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default CharacterStates;
