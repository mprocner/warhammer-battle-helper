import React from 'react';
import { useTranslation } from 'react-i18next';
import CloseIcon from '@mui/icons-material/Close';

function SpellsSection({ character, setCharacter, scheduleAutoSave }) {
    const { t } = useTranslation();

    const handleAddSpell = () => {
        setCharacter(prev => ({
            ...prev,
            spells: [
                ...(prev.spells || []),
                { name: '', cn: '', range: '', target: '', duration: '', effect: '' }
            ]
        }));
        scheduleAutoSave();
    };

    const handleRemoveSpell = (index) => {
        setCharacter(prev => ({
            ...prev,
            spells: prev.spells.filter((_, idx) => idx !== index)
        }));
        scheduleAutoSave();
    };

    const handleSpellFieldChange = (index, field, value) => {
        setCharacter(prev => ({
            ...prev,
            spells: prev.spells.map((spell, idx) =>
                idx === index ? { ...spell, [field]: value } : spell
            )
        }));
        scheduleAutoSave();
    };

    return (
        <div className="card-section">
            <h3>{t('characterSheet.spellsAndPrayers')}</h3>
            <table className="skills-table">
                <thead>
                    <tr>
                        <th>{t('characterSheet.name')}</th>
                        <th style={{ width: '50px' }}>{t('characterSheet.cn')}</th>
                        <th style={{ width: '70px' }}>{t('characterSheet.range')}</th>
                        <th style={{ width: '70px' }}>{t('characterSheet.target')}</th>
                        <th style={{ width: '70px' }}>{t('characterSheet.duration')}</th>
                        <th>{t('characterSheet.effect')}</th>
                        <th style={{ width: '40px' }}></th>
                    </tr>
                </thead>
                <tbody>
                    {character.spells?.map((spell, idx) => (
                        <tr key={idx}>
                            <td><input type="text" value={spell.name || ''} onChange={(e) => handleSpellFieldChange(idx, 'name', e.target.value)} /></td>
                            <td><input type="number" value={spell.cn || ''} onChange={(e) => handleSpellFieldChange(idx, 'cn', e.target.value)} /></td>
                            <td><input type="text" value={spell.range || ''} onChange={(e) => handleSpellFieldChange(idx, 'range', e.target.value)} /></td>
                            <td><input type="text" value={spell.target || ''} onChange={(e) => handleSpellFieldChange(idx, 'target', e.target.value)} /></td>
                            <td><input type="text" value={spell.duration || ''} onChange={(e) => handleSpellFieldChange(idx, 'duration', e.target.value)} /></td>
                            <td><input type="text" value={spell.effect || ''} onChange={(e) => handleSpellFieldChange(idx, 'effect', e.target.value)} /></td>
                            <td>
                                <button
                                    className="skill-delete-btn"
                                    onClick={() => handleRemoveSpell(idx)}
                                    title={t('common.delete')}
                                >
                                    <CloseIcon fontSize="small" />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div style={{ marginTop: '10px' }}>
                <button className="add-item-btn" onClick={handleAddSpell}>
                    + {t('characterSheet.addSpell')}
                </button>
            </div>
        </div>
    );
}

export default SpellsSection;
