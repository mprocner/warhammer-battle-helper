import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import skillsData from '../../../data/skills.json';
import axiosInstance from '../../../api/axios';

function BasicSkillsSection({ character, setCharacter, scheduleAutoSave, onCharacterUpdate, getCharacterSaveUrl, onSkillClick, getCharacteristicValue }) {
    const { t } = useTranslation(['translation', 'skills']);

    const basicSkills = useMemo(() => {
        const skills = [];
        skillsData
            .filter(skill => skill.type === 'basic' && skill.key !== 'MELEE')
            .forEach(skill => {
                if (skill.showAllSpecializations && skill.specialisations) {
                    skill.specialisations.forEach(spec => {
                        skills.push({
                            key: `${skill.key}_${spec}`,
                            name: `${t(`skills:${skill.key}.name`)} (${t(`skills:${skill.key}.specialisations.${spec}`)})`,
                            characteristic: skill.characteristic,
                            isGrouped: true,
                            parentKey: skill.key,
                            specializationKey: spec
                        });
                    });
                } else if (skill.basicSpecialization && skill.specialisations) {
                    const spec = skill.basicSpecialization;
                    skills.push({
                        key: `${skill.key}_${spec}`,
                        name: `${t(`skills:${skill.key}.name`)} (${t(`skills:${skill.key}.specialisations.${spec}`)})`,
                        characteristic: skill.characteristic,
                        isGrouped: true,
                        parentKey: skill.key,
                        specializationKey: spec
                    });
                } else {
                    skills.push({
                        key: skill.key,
                        name: t(`skills:${skill.key}.name`),
                        characteristic: skill.characteristic
                    });
                }
            });
        return skills.sort((a, b) => a.name.localeCompare(b.name));
    }, [t]);

    const [activeTooltip, setActiveTooltip] = React.useState(null);

    const handleTooltipToggle = (key, e) => {
        e.stopPropagation();
        setActiveTooltip(activeTooltip === key ? null : key);
    };

    const getSkillAdvances = (skillKey) => parseInt(character.basicSkills?.[skillKey]) || 0;

    const calculateSkillValue = (skillKey, characteristic) => {
        return getCharacteristicValue(characteristic) + getSkillAdvances(skillKey);
    };

    const handleSkillAdvancesChange = (skillKey, value) => {
        setCharacter(prev => ({
            ...prev,
            basicSkills: { ...prev.basicSkills, [skillKey]: parseInt(value) || 0 }
        }));
        scheduleAutoSave();
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
            await axiosInstance.put(getCharacterSaveUrl(updatedCharacter.id), updatedCharacter);
            if (onCharacterUpdate) onCharacterUpdate(updatedCharacter);
        } catch (error) {
            console.error('Error saving character:', error);
            alert('Failed to save character: ' + (error.response?.data?.error || error.message));
        }
    };

    const half = Math.ceil(basicSkills.length / 2);

    const renderSkillRow = (skill, tooltipPrefix) => {
        const skillKey = skill.isGrouped ? skill.parentKey : skill.key;
        const tooltipKey = `${tooltipPrefix}-${skill.key}`;
        const isFavorite = character.favoriteSkills?.includes(skill.key);
        const skillValue = calculateSkillValue(skill.key, skill.characteristic);

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
                        value={getSkillAdvances(skill.key)}
                        onChange={(e) => handleSkillAdvancesChange(skill.key, e.target.value)}
                        min="0"
                    />
                </td>
                <td><input type="text" value={skillValue} readOnly /></td>
            </tr>
        );
    };

    const tableHead = (
        <thead>
            <tr>
                <th style={{ width: '30px' }}><StarIcon style={{ fontSize: 14, color: '#c9975b', verticalAlign: 'middle' }} /></th>
                <th>{t('characterSheet.name')}</th>
                <th style={{ width: '50px' }}>{t('characterSheet.char')}</th>
                <th style={{ width: '50px' }}>{t('characterSheet.adv')}</th>
                <th style={{ width: '50px' }}>{t('characterSheet.skill')}</th>
            </tr>
        </thead>
    );

    return (
        <div className="card-section">
            <h3>{t('characterSheet.basicSkills')}</h3>
            <div className="two-col-layout">
                <table className="skills-table">
                    {tableHead}
                    <tbody>{basicSkills.slice(0, half).map(s => renderSkillRow(s, 'basic'))}</tbody>
                </table>
                <table className="skills-table">
                    {tableHead}
                    <tbody>{basicSkills.slice(half).map(s => renderSkillRow(s, 'basic2'))}</tbody>
                </table>
            </div>
        </div>
    );
}

export default BasicSkillsSection;
