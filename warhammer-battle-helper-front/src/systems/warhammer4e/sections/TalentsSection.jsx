import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import CloseIcon from '@mui/icons-material/Close';
import talentsData from '../../../data/talents.json';
import CustomItemModal from '../CustomItemModal';

function TalentsSection({ character, setCharacter, scheduleAutoSave }) {
    const { t } = useTranslation(['translation', 'talents']);
    const [activeTooltip, setActiveTooltip] = useState(null);
    const [showCustomTalentModal, setShowCustomTalentModal] = useState(false);
    const [customTalentForm, setCustomTalentForm] = useState({ name: '', description: '' });
    const [editingCustomTalentKey, setEditingCustomTalentKey] = useState(null);

    const talentsWithSituation = useMemo(() => {
        return new Set(talentsData.filter(t => t.hasSituation).map(t => t.key));
    }, []);

    const talentOptions = useMemo(() => {
        return talentsData.map(talent => ({
            key: talent.key,
            name: t(`talents:${talent.key}.name`),
            max: talent.max
        })).sort((a, b) => a.name.localeCompare(b.name));
    }, [t]);

    const sortedTalents = useMemo(() => {
        if (!character.talents) return [];
        return [...character.talents].sort((a, b) => {
            const nameA = a.key.startsWith('CUSTOM_') ? a.name : t(`talents:${a.key}.name`);
            const nameB = b.key.startsWith('CUSTOM_') ? b.name : t(`talents:${b.key}.name`);
            return nameA.localeCompare(nameB);
        });
    }, [character.talents, t]);

    const handleTooltipToggle = (key, e) => {
        e.stopPropagation();
        setActiveTooltip(activeTooltip === key ? null : key);
    };

    const handleAddTalent = (talentKey) => {
        if (!talentKey) return;
        if (character.talents?.some(t => t.key === talentKey)) {
            alert(t('validation.talentAlreadyAdded'));
            return;
        }
        setCharacter(prev => ({
            ...prev,
            talents: [...(prev.talents || []), { key: talentKey, timesTaken: 1 }]
        }));
        scheduleAutoSave();
    };

    const handleRemoveTalent = (index) => {
        setCharacter(prev => ({
            ...prev,
            talents: prev.talents.filter((_, idx) => idx !== index)
        }));
        scheduleAutoSave();
    };

    const handleTalentTimesTakenChange = (index, value) => {
        const numValue = Math.max(1, parseInt(value) || 1);
        setCharacter(prev => ({
            ...prev,
            talents: prev.talents.map((talent, idx) =>
                idx === index ? { ...talent, timesTaken: numValue } : talent
            )
        }));
        scheduleAutoSave();
    };

    const handleTalentSituationChange = (index, value) => {
        setCharacter(prev => ({
            ...prev,
            talents: prev.talents.map((talent, idx) =>
                idx === index ? { ...talent, situation: value } : talent
            )
        }));
        scheduleAutoSave();
    };

    const handleOpenCustomTalentModal = (editKey = null) => {
        if (editKey) {
            const ct = character.talents?.find(t => t.key === editKey);
            if (ct) {
                setCustomTalentForm({ name: ct.name || '', description: ct.description || '' });
                setEditingCustomTalentKey(editKey);
            }
        } else {
            setCustomTalentForm({ name: '', description: '' });
            setEditingCustomTalentKey(null);
        }
        setShowCustomTalentModal(true);
    };

    const handleSaveCustomTalent = () => {
        if (!customTalentForm.name.trim()) return;
        const key = editingCustomTalentKey || `CUSTOM_${Date.now()}`;
        setCharacter(prev => ({
            ...prev,
            talents: editingCustomTalentKey
                ? (prev.talents || []).map(t => t.key === editingCustomTalentKey
                    ? { ...t, name: customTalentForm.name.trim(), description: customTalentForm.description.trim() }
                    : t)
                : [...(prev.talents || []), { key, name: customTalentForm.name.trim(), description: customTalentForm.description.trim(), timesTaken: 1 }]
        }));
        setShowCustomTalentModal(false);
        scheduleAutoSave();
    };

    return (
        <>
            <div className="card-section">
                <h3>{t('characterSheet.talents')}</h3>
                <table className="skills-table">
                    <thead>
                        <tr>
                            <th>{t('characterSheet.talentName')}</th>
                            <th>{t('characterSheet.situation')}</th>
                            <th style={{ width: '60px' }}>{t('characterSheet.rozw')}</th>
                            <th style={{ width: '40px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedTalents.map((talent) => {
                            const actualIndex = character.talents?.findIndex(t => t.key === talent.key);
                            const isCustomTalent = talent.key.startsWith('CUSTOM_');
                            const talentName = isCustomTalent ? talent.name : t(`talents:${talent.key}.name`);
                            const talentDescription = isCustomTalent ? talent.description : t(`talents:${talent.key}.description`);
                            return (
                                <tr key={talent.key}>
                                    <td className="skill-name">
                                        <span>{talentName}</span>
                                        {isCustomTalent && (
                                            <span
                                                className="skill-info-icon"
                                                onClick={() => handleOpenCustomTalentModal(talent.key)}
                                                style={{ cursor: 'pointer' }}
                                                title={t('characterSheet.editCustomTalentModalTitle')}
                                            >
                                                ✏
                                            </span>
                                        )}
                                        <span
                                            className="skill-info-icon"
                                            onClick={(e) => handleTooltipToggle(`talent-${talent.key}`, e)}
                                        >
                                            ⓘ
                                        </span>
                                        {activeTooltip === `talent-${talent.key}` && (
                                            <div className="talent-tooltip">{talentDescription}</div>
                                        )}
                                    </td>
                                    <td>
                                        {talentsWithSituation.has(talent.key) && (
                                            <input
                                                type="text"
                                                value={talent.situation || ''}
                                                onChange={(e) => handleTalentSituationChange(actualIndex, e.target.value)}
                                            />
                                        )}
                                    </td>
                                    <td>
                                        <input
                                            type="number"
                                            value={talent.timesTaken || 1}
                                            onChange={(e) => handleTalentTimesTakenChange(actualIndex, e.target.value)}
                                            min="1"
                                        />
                                    </td>
                                    <td>
                                        <button
                                            className="skill-delete-btn"
                                            onClick={() => handleRemoveTalent(actualIndex)}
                                            title={t('common.delete')}
                                        >
                                            <CloseIcon fontSize="small" />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {(!character.talents || character.talents.length === 0) && (
                            <tr>
                                <td colSpan="4" style={{ textAlign: 'center', fontStyle: 'italic' }}>
                                    {t('characterSheet.noTalents')}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                <div style={{ marginTop: '10px' }}>
                    <select
                        onChange={(e) => {
                            handleAddTalent(e.target.value);
                            e.target.value = '';
                        }}
                        style={{ width: '100%', padding: '5px' }}
                    >
                        <option value="">{t('characterSheet.addTalent')}</option>
                        {talentOptions
                            .filter(option => !character.talents?.some(t => t.key === option.key))
                            .map(option => (
                                <option key={option.key} value={option.key}>
                                    {option.name}
                                </option>
                            ))
                        }
                    </select>
                    <button
                        className="add-item-btn"
                        onClick={() => handleOpenCustomTalentModal()}
                        style={{ marginTop: '5px' }}
                    >
                        + {t('characterSheet.addCustomTalent')}
                    </button>
                </div>
            </div>

            {showCustomTalentModal && (
                <CustomItemModal
                    type="talent"
                    isEditing={!!editingCustomTalentKey}
                    form={customTalentForm}
                    onChange={setCustomTalentForm}
                    onSave={handleSaveCustomTalent}
                    onCancel={() => setShowCustomTalentModal(false)}
                />
            )}
        </>
    );
}

export default TalentsSection;
