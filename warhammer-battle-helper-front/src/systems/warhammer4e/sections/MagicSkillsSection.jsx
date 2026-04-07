import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import skillsData from '../../../data/skills.json';
import axiosInstance from '../../../api/axios';
import { buildPayload } from '../buildPayload';

function MagicSkillsSection({ character, setCharacter, scheduleAutoSave, onCharacterUpdate, getCharacterSaveUrl, onSkillClick, getCharacteristicValue }) {
    const { t } = useTranslation(['translation', 'skills']);
    const [activeTooltip, setActiveTooltip] = useState(null);

    const magicSkills = useMemo(() => {
        const skills = [];
        skillsData
            .filter(skill => skill.magicSkill)
            .forEach(skill => {
                if (skill.key === 'CHANNELLING' && skill.showAsGeneral) {
                    skills.push({
                        key: skill.key,
                        name: t(`skills:${skill.key}.name`),
                        characteristic: skill.characteristic,
                        isGeneral: true
                    });
                } else if (skill.key === 'LANGUAGE' && skill.magicSpecialization) {
                    const spec = skill.magicSpecialization;
                    skills.push({
                        key: `${skill.key}_${spec}`,
                        name: `${t(`skills:${skill.key}.name`)} (${t(`skills:${skill.key}.specialisations.${spec}`)})`,
                        characteristic: skill.characteristic,
                        isGrouped: true,
                        parentKey: skill.key,
                        specializationKey: spec
                    });
                } else if (!skill.grouped) {
                    skills.push({
                        key: skill.key,
                        name: t(`skills:${skill.key}.name`),
                        characteristic: skill.characteristic
                    });
                }
            });
        return skills;
    }, [t]);

    if (magicSkills.length === 0) return null;

    const handleTooltipToggle = (key, e) => {
        e.stopPropagation();
        setActiveTooltip(activeTooltip === key ? null : key);
    };

    const getAdvances = (skill) => {
        if (skill.isGeneral) return parseInt(character.basicSkills?.[skill.key]) || 0;
        if (skill.isGrouped) return parseInt(character.basicSkills?.[`${skill.parentKey}_${skill.specializationKey}`]) || 0;
        return parseInt(character.advancedSkills?.[skill.key]) || 0;
    };

    const getSkillValue = (skill) => {
        return getCharacteristicValue(skill.characteristic) + getAdvances(skill);
    };

    const handleToggleFavoriteSkill = async (skillKey) => {
        const updatedCharacter = {
            ...character,
            favoriteSkills: character.favoriteSkills?.includes(skillKey)
                ? character.favoriteSkills.filter(k => k !== skillKey)
                : [...(character.favoriteSkills || []), skillKey]
        };
        setCharacter(updatedCharacter);
        try {
            await axiosInstance.put(getCharacterSaveUrl(updatedCharacter.id), buildPayload(updatedCharacter));
            if (onCharacterUpdate) onCharacterUpdate(updatedCharacter);
        } catch (error) {
            console.error('Error saving character:', error);
            alert('Failed to save character: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleAdvancesChange = (skill, value) => {
        const numValue = parseInt(value) || 0;
        if (skill.isGeneral) {
            setCharacter(prev => ({
                ...prev,
                basicSkills: { ...prev.basicSkills, [skill.key]: numValue }
            }));
        } else if (skill.isGrouped) {
            const compoundKey = `${skill.parentKey}_${skill.specializationKey}`;
            setCharacter(prev => ({
                ...prev,
                basicSkills: { ...prev.basicSkills, [compoundKey]: numValue }
            }));
        } else {
            setCharacter(prev => ({
                ...prev,
                advancedSkills: { ...prev.advancedSkills, [skill.key]: numValue }
            }));
        }
        scheduleAutoSave();
    };

    return (
        <div className="card-section">
            <h3>{t('characterSheet.magicSkills')}</h3>
            <table className="skills-table">
                <thead>
                    <tr>
                        <th style={{ width: '30px' }}><StarIcon style={{ fontSize: 14, color: '#c9975b', verticalAlign: 'middle' }} /></th>
                        <th>{t('characterSheet.name')}</th>
                        <th style={{ width: '50px' }}>{t('characterSheet.char')}</th>
                        <th style={{ width: '50px' }}>{t('characterSheet.adv')}</th>
                        <th style={{ width: '50px' }}>{t('characterSheet.skill')}</th>
                    </tr>
                </thead>
                <tbody>
                    {magicSkills.map((skill) => {
                        const tooltipKey = `magic-${skill.key}`;
                        const skillKey = skill.isGrouped ? skill.parentKey : skill.key;
                        const isFavorite = character.favoriteSkills?.includes(skill.key);
                        const advances = getAdvances(skill);
                        const skillValue = getSkillValue(skill);

                        return (
                            <tr key={skill.key}>
                                <td style={{ textAlign: 'center', padding: '2px' }}>
                                    <span
                                        onClick={() => handleToggleFavoriteSkill(skill.key)}
                                        className="skill-favorite-btn"
                                        title={isFavorite ? t('characterSheet.removeFromFavorites') : t('characterSheet.addToFavorites')}
                                    >
                                        {isFavorite
                                            ? <StarIcon style={{ fontSize: 16, color: '#c9975b' }} />
                                            : <StarBorderIcon style={{ fontSize: 16, color: '#c9975b' }} />
                                        }
                                    </span>
                                </td>
                                <td className="skill-name">
                                    <span
                                        onClick={(e) => onSkillClick(skill.name, skill.key, skillValue, e)}
                                        style={{ cursor: 'pointer' }}
                                        title={t('combat.rollTest', { characteristic: skill.name })}
                                    >
                                        {skill.name}
                                    </span>
                                    <span className="skill-info-icon" onClick={(e) => handleTooltipToggle(tooltipKey, e)}>ⓘ</span>
                                    {activeTooltip === tooltipKey && (
                                        <div className="skill-tooltip">{t(`skills:${skillKey}.description`)}</div>
                                    )}
                                </td>
                                <td><input type="text" value={t(`characteristicsShort.${skill.characteristic}`)} readOnly /></td>
                                <td>
                                    <input
                                        type="number"
                                        value={advances}
                                        onChange={(e) => handleAdvancesChange(skill, e.target.value)}
                                        min="0"
                                    />
                                </td>
                                <td><input type="text" value={skillValue} readOnly /></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export default MagicSkillsSection;
