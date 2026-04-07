import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import skillsData from '../../../data/skills.json';
import axiosInstance from '../../../api/axios';
import { buildPayload } from '../buildPayload';

function WeaponSkillsSection({ character, setCharacter, scheduleAutoSave, onCharacterUpdate, getCharacterSaveUrl, onSkillClick, getCharacteristicValue }) {
    const { t } = useTranslation(['translation', 'skills']);
    const [activeTooltip, setActiveTooltip] = useState(null);

    const meleeSkill = useMemo(() => {
        const skill = skillsData.find(s => s.key === 'MELEE');
        if (!skill) return null;
        return {
            key: skill.key,
            name: t(`skills:${skill.key}.name`),
            characteristic: skill.characteristic,
            specialisations: skill.specialisations || [],
            basicMeleeSpecializations: skill.basicMeleeSpecializations || []
        };
    }, [t]);

    const rangedSkill = useMemo(() => {
        const skill = skillsData.find(s => s.key === 'RANGED');
        if (!skill) return null;
        return {
            key: skill.key,
            name: t(`skills:${skill.key}.name`),
            characteristic: skill.characteristic,
            specialisations: skill.specialisations || []
        };
    }, [t]);

    const handleTooltipToggle = (key, e) => {
        e.stopPropagation();
        setActiveTooltip(activeTooltip === key ? null : key);
    };

    const getGroupedSkillAdvances = (parentKey, spec) => {
        return parseInt(character.basicSkills?.[`${parentKey}_${spec}`]) || 0;
    };

    const calculateGroupedSkillValue = (parentKey, spec, characteristic) => {
        return getCharacteristicValue(characteristic) + getGroupedSkillAdvances(parentKey, spec);
    };

    const handleGroupedSkillAdvancesChange = (parentKey, spec, value) => {
        const compoundKey = `${parentKey}_${spec}`;
        setCharacter(prev => ({
            ...prev,
            basicSkills: { ...prev.basicSkills, [compoundKey]: parseInt(value) || 0 }
        }));
        scheduleAutoSave();
    };

    const handleRemoveGroupedSkill = (parentKey, spec) => {
        const compoundKey = `${parentKey}_${spec}`;
        setCharacter(prev => {
            const newBasicSkills = { ...prev.basicSkills };
            delete newBasicSkills[compoundKey];
            return { ...prev, basicSkills: newBasicSkills };
        });
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
            await axiosInstance.put(getCharacterSaveUrl(updatedCharacter.id), buildPayload(updatedCharacter));
            if (onCharacterUpdate) onCharacterUpdate(updatedCharacter);
        } catch (error) {
            console.error('Error saving character:', error);
            alert('Failed to save character: ' + (error.response?.data?.error || error.message));
        }
    };

    const renderSkillRow = (skill, spec, tooltipKey, canDelete) => {
        const compoundKey = `${skill.key}_${spec}`;
        const isFavorite = character.favoriteSkills?.includes(compoundKey);
        const skillValue = calculateGroupedSkillValue(skill.key, spec, skill.characteristic);
        const skillName = `${skill.name} (${t(`skills:${skill.key}.specialisations.${spec}`)})`;

        return (
            <tr key={compoundKey}>
                <td style={{ textAlign: 'center', padding: '2px' }}>
                    <span
                        onClick={() => handleToggleFavoriteSkill(compoundKey)}
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
                        onClick={(e) => onSkillClick(skillName, compoundKey, skillValue, e)}
                        style={{ cursor: 'pointer' }}
                        title={t('combat.rollTest', { characteristic: skillName })}
                    >
                        {skillName}
                    </span>
                    <span className="skill-info-icon" onClick={(e) => handleTooltipToggle(tooltipKey, e)}>ⓘ</span>
                    {activeTooltip === tooltipKey && (
                        <div className="skill-tooltip">{t(`skills:${skill.key}.description`)}</div>
                    )}
                </td>
                <td><input type="text" value={t(`characteristicsShort.${skill.characteristic}`)} readOnly /></td>
                <td>
                    <input
                        type="number"
                        value={getGroupedSkillAdvances(skill.key, spec)}
                        onChange={(e) => handleGroupedSkillAdvancesChange(skill.key, spec, e.target.value)}
                        min="0"
                    />
                </td>
                <td><input type="text" value={skillValue} readOnly /></td>
                <td>
                    {canDelete && (
                        <button
                            className="skill-delete-btn"
                            onClick={() => handleRemoveGroupedSkill(skill.key, spec)}
                            title={t('common.delete')}
                        >
                            ×
                        </button>
                    )}
                </td>
            </tr>
        );
    };

    if (!meleeSkill) return null;

    const tableHead = (
        <thead>
            <tr>
                <th style={{ width: '30px' }}><StarIcon style={{ fontSize: 14, color: '#c9975b', verticalAlign: 'middle' }} /></th>
                <th>{t('characterSheet.name')}</th>
                <th style={{ width: '50px' }}>{t('characterSheet.char')}</th>
                <th style={{ width: '50px' }}>{t('characterSheet.adv')}</th>
                <th style={{ width: '50px' }}>{t('characterSheet.skill')}</th>
                <th style={{ width: '40px' }}></th>
            </tr>
        </thead>
    );

    return (
        <div className="card-section">
            <h3>{t('characterSheet.weaponSkills')}</h3>
            <table className="skills-table">
                {tableHead}
                <tbody>
                    {/* Always-visible basic melee specializations */}
                    {meleeSkill.basicMeleeSpecializations.map(spec =>
                        renderSkillRow(meleeSkill, spec, `melee-${spec}`, false)
                    )}
                    {/* Added melee specializations */}
                    {character.basicSkills &&
                        Object.keys(character.basicSkills)
                            .filter(key => {
                                if (!key.startsWith(`${meleeSkill.key}_`)) return false;
                                const spec = key.replace(`${meleeSkill.key}_`, '');
                                return !meleeSkill.basicMeleeSpecializations.includes(spec);
                            })
                            .map(compoundKey => {
                                const spec = compoundKey.replace(`${meleeSkill.key}_`, '');
                                return renderSkillRow(meleeSkill, spec, `melee-added-${spec}`, true);
                            })
                    }
                    {/* Added ranged specializations */}
                    {rangedSkill && character.basicSkills &&
                        Object.keys(character.basicSkills)
                            .filter(key => key.startsWith(`${rangedSkill.key}_`))
                            .map(compoundKey => {
                                const spec = compoundKey.replace(`${rangedSkill.key}_`, '');
                                return renderSkillRow(rangedSkill, spec, `ranged-${spec}`, true);
                            })
                    }
                </tbody>
            </table>
            <div style={{ marginTop: '10px' }}>
                <select
                    onChange={(e) => {
                        if (e.target.value) {
                            const [skillKey, spec] = e.target.value.split('_');
                            handleGroupedSkillAdvancesChange(skillKey, spec, '0');
                        }
                        e.target.value = '';
                    }}
                    style={{ width: '100%', padding: '5px' }}
                >
                    <option value="">{t('characterSheet.addWeaponSkill')}</option>
                    {meleeSkill.specialisations
                        .filter(spec => {
                            if (meleeSkill.basicMeleeSpecializations.includes(spec)) return false;
                            return !(`${meleeSkill.key}_${spec}` in (character.basicSkills || {}));
                        })
                        .map(spec => (
                            <option key={`${meleeSkill.key}_${spec}`} value={`${meleeSkill.key}_${spec}`}>
                                {meleeSkill.name} ({t(`skills:${meleeSkill.key}.specialisations.${spec}`)})
                            </option>
                        ))
                    }
                    {rangedSkill && rangedSkill.specialisations
                        .filter(spec => !(`${rangedSkill.key}_${spec}` in (character.basicSkills || {})))
                        .map(spec => (
                            <option key={`${rangedSkill.key}_${spec}`} value={`${rangedSkill.key}_${spec}`}>
                                {rangedSkill.name} ({t(`skills:${rangedSkill.key}.specialisations.${spec}`)})
                            </option>
                        ))
                    }
                </select>
            </div>
        </div>
    );
}

export default WeaponSkillsSection;
