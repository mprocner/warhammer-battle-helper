import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import skillsData from '../../../data/skills.json';
import CustomItemModal from '../CustomItemModal';
import axiosInstance from '../../../api/axios';
import { buildPayload } from '../buildPayload';

function AdvancedSkillsSection({ character, setCharacter, scheduleAutoSave, onCharacterUpdate, getCharacterSaveUrl, onSkillClick, getCharacteristicValue }) {
    const { t } = useTranslation(['translation', 'skills']);
    const [activeTooltip, setActiveTooltip] = useState(null);
    const [showCustomSkillModal, setShowCustomSkillModal] = useState(false);
    const [customSkillForm, setCustomSkillForm] = useState({ name: '', characteristic: 'WEAPON_SKILL', description: '' });
    const [editingCustomSkillKey, setEditingCustomSkillKey] = useState(null);

    const advancedSkillsOptions = useMemo(() => {
        const options = [];
        skillsData
            .filter(skill => {
                if (skill.weaponSkill) return false;
                if (skill.magicSkill && (skill.key === 'CHANNELLING' || skill.key === 'PRAY')) return false;
                if (skill.key === 'LANGUAGE') return true;
                if (skill.type === 'advanced') return true;
                if (skill.type === 'basic' && skill.grouped && !skill.showAllSpecializations) return true;
                return false;
            })
            .forEach(skill => {
                if (skill.grouped && skill.specialisations) {
                    skill.specialisations.forEach(spec => {
                        if (skill.basicSpecialization && spec === skill.basicSpecialization) return;
                        if (skill.magicSpecialization && spec === skill.magicSpecialization) return;
                        options.push({
                            key: `${skill.key}_${spec}`,
                            name: `${t(`skills:${skill.key}.name`)} (${t(`skills:${skill.key}.specialisations.${spec}`)})`,
                            characteristic: skill.characteristic
                        });
                    });
                } else {
                    options.push({
                        key: skill.key,
                        name: t(`skills:${skill.key}.name`),
                        characteristic: skill.characteristic
                    });
                }
            });
        return options.sort((a, b) => a.name.localeCompare(b.name));
    }, [t]);

    const advancedSkillsList = useMemo(() => {
        const list = [];
        if (character.advancedSkills) {
            Object.keys(character.advancedSkills).forEach(skillKey => {
                const customSkill = character.customSkills?.find(cs => cs.key === skillKey);
                if (customSkill) {
                    list.push({
                        key: skillKey,
                        name: customSkill.name,
                        characteristic: customSkill.characteristic,
                        description: customSkill.description,
                        advances: character.advancedSkills[skillKey],
                        isCustom: true
                    });
                    return;
                }
                const skillOption = advancedSkillsOptions.find(s => s.key === skillKey);
                if (!skillOption) return;
                list.push({
                    key: skillKey,
                    name: skillOption.name,
                    characteristic: skillOption.characteristic,
                    advances: character.advancedSkills[skillKey]
                });
            });
        }
        return list.sort((a, b) => a.name.localeCompare(b.name));
    }, [character.advancedSkills, character.customSkills, advancedSkillsOptions]);

    const handleTooltipToggle = (key, e) => {
        e.stopPropagation();
        setActiveTooltip(activeTooltip === key ? null : key);
    };

    const calculateAdvancedSkillValue = (skillKey, characteristic) => {
        return getCharacteristicValue(characteristic) + (parseInt(character.advancedSkills?.[skillKey]) || 0);
    };

    const handleAddAdvancedSkill = (skillKey) => {
        if (!skillKey) return;
        if (character.advancedSkills?.[skillKey] !== undefined) {
            alert(t('validation.skillAlreadyAdded'));
            return;
        }
        setCharacter(prev => ({
            ...prev,
            advancedSkills: { ...prev.advancedSkills, [skillKey]: 0 }
        }));
        scheduleAutoSave();
    };

    const handleAdvancedSkillAdvancesChange = (skillKey, value) => {
        setCharacter(prev => ({
            ...prev,
            advancedSkills: { ...prev.advancedSkills, [skillKey]: parseInt(value) || 0 }
        }));
        scheduleAutoSave();
    };

    const handleRemoveAdvancedSkill = (skillKey) => {
        setCharacter(prev => {
            const newAdvancedSkills = { ...prev.advancedSkills };
            delete newAdvancedSkills[skillKey];
            const newCustomSkills = (prev.customSkills || []).filter(cs => cs.key !== skillKey);
            const newFavoriteSkills = (prev.favoriteSkills || []).filter(k => k !== skillKey);
            return { ...prev, advancedSkills: newAdvancedSkills, customSkills: newCustomSkills, favoriteSkills: newFavoriteSkills };
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

    const handleOpenCustomSkillModal = (editKey = null) => {
        if (editKey) {
            const cs = character.customSkills?.find(s => s.key === editKey);
            if (cs) {
                setCustomSkillForm({ name: cs.name, characteristic: cs.characteristic, description: cs.description || '' });
                setEditingCustomSkillKey(editKey);
            }
        } else {
            setCustomSkillForm({ name: '', characteristic: 'WEAPON_SKILL', description: '' });
            setEditingCustomSkillKey(null);
        }
        setShowCustomSkillModal(true);
    };

    const handleSaveCustomSkill = () => {
        if (!customSkillForm.name.trim()) return;
        const key = editingCustomSkillKey || `CUSTOM_${Date.now()}`;
        setCharacter(prev => {
            const newCustomSkills = editingCustomSkillKey
                ? (prev.customSkills || []).map(cs => cs.key === editingCustomSkillKey
                    ? { ...cs, name: customSkillForm.name.trim(), characteristic: customSkillForm.characteristic, description: customSkillForm.description.trim() }
                    : cs)
                : [...(prev.customSkills || []), { key, name: customSkillForm.name.trim(), characteristic: customSkillForm.characteristic, description: customSkillForm.description.trim() }];
            const newAdvancedSkills = { ...prev.advancedSkills };
            if (!editingCustomSkillKey) newAdvancedSkills[key] = 0;
            return { ...prev, customSkills: newCustomSkills, advancedSkills: newAdvancedSkills };
        });
        setShowCustomSkillModal(false);
        scheduleAutoSave();
    };

    return (
        <>
            <div className="card-section">
                <h3>{t('characterSheet.groupedAdvancedSkills')}</h3>
                <table className="skills-table">
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
                    <tbody>
                        {advancedSkillsList.map((skill) => {
                            const isCustom = skill.isCustom;
                            const baseSkillKey = !isCustom && skill.key.includes('_') ? skill.key.split('_')[0] : skill.key;
                            const tooltipKey = `advanced-${skill.key}`;
                            const isFavorite = character.favoriteSkills?.includes(skill.key);
                            const skillValue = calculateAdvancedSkillValue(skill.key, skill.characteristic);
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
                                        {isCustom && (
                                            <span
                                                className="skill-info-icon"
                                                onClick={() => handleOpenCustomSkillModal(skill.key)}
                                                style={{ cursor: 'pointer' }}
                                                title={t('characterSheet.editCustomSkillModalTitle')}
                                            >
                                                ✏
                                            </span>
                                        )}
                                        <span className="skill-info-icon" onClick={(e) => handleTooltipToggle(tooltipKey, e)}>ⓘ</span>
                                        {activeTooltip === tooltipKey && (
                                            <div className="skill-tooltip">
                                                {isCustom ? skill.description : t(`skills:${baseSkillKey}.description`)}
                                            </div>
                                        )}
                                    </td>
                                    <td><input type="text" value={t(`characteristicsShort.${skill.characteristic}`)} readOnly /></td>
                                    <td>
                                        <input
                                            type="number"
                                            value={skill.advances}
                                            onChange={(e) => handleAdvancedSkillAdvancesChange(skill.key, e.target.value)}
                                            min="0"
                                        />
                                    </td>
                                    <td><input type="text" value={skillValue} readOnly /></td>
                                    <td>
                                        <button
                                            className="skill-delete-btn"
                                            onClick={() => handleRemoveAdvancedSkill(skill.key)}
                                            title={t('common.delete')}
                                        >
                                            ×
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {advancedSkillsList.length === 0 && (
                            <tr>
                                <td colSpan="5" style={{ textAlign: 'center', fontStyle: 'italic' }}>
                                    {t('characterSheet.noAdvancedSkills')}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                <div style={{ marginTop: '10px' }}>
                    <select
                        onChange={(e) => {
                            handleAddAdvancedSkill(e.target.value);
                            e.target.value = '';
                        }}
                        style={{ width: '100%', padding: '5px' }}
                    >
                        <option value="">{t('characterSheet.addAdvancedSkill')}</option>
                        {advancedSkillsOptions
                            .filter(option => !(option.key in (character.advancedSkills || {})))
                            .map(option => (
                                <option key={option.key} value={option.key}>
                                    {option.name}
                                </option>
                            ))
                        }
                    </select>
                    <button
                        className="add-item-btn"
                        onClick={() => handleOpenCustomSkillModal()}
                        style={{ marginTop: '5px' }}
                    >
                        + {t('characterSheet.addCustomSkill')}
                    </button>
                </div>
            </div>

            {showCustomSkillModal && (
                <CustomItemModal
                    type="skill"
                    isEditing={!!editingCustomSkillKey}
                    form={customSkillForm}
                    onChange={setCustomSkillForm}
                    onSave={handleSaveCustomSkill}
                    onCancel={() => setShowCustomSkillModal(false)}
                />
            )}
        </>
    );
}

export default AdvancedSkillsSection;
