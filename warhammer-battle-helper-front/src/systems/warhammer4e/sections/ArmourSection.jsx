import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import armourData from '../../../data/armour.json';

function ArmourSection({ character, setCharacter, scheduleAutoSave }) {
    const { t } = useTranslation(['translation', 'armour']);

    const armourOptions = useMemo(() => {
        return armourData.map(armour => {
            const armourName = t(`armour:armour.${armour.key}.name`);
            const typeTranslation = t(`armour:types.${armour.type}`);
            return {
                key: armour.key,
                name: armourName,
                displayName: `${armourName} (${typeTranslation})`,
                type: armour.type
            };
        });
    }, [t]);

    const handleAddArmour = (armourKey) => {
        if (!armourKey) return;
        const armourItem = armourData.find(a => a.key === armourKey);
        if (!armourItem) return;

        const armourName = t(`armour:armour.${armourItem.key}.name`);
        const locationsText = armourItem.locations
            .map(loc => t(`armour:locations.${loc}`))
            .join(', ');
        const qualitiesText = armourItem.qualities.length > 0
            ? armourItem.qualities.map(q => t(`armour:qualities.${q}`)).join(', ')
            : '';

        setCharacter(prev => ({
            ...prev,
            armour: [
                ...(prev.armour || []),
                {
                    name: armourName,
                    locations: locationsText,
                    enc: armourItem.encumbrance.toString(),
                    ap: armourItem.armorPoints.toString(),
                    qualities: qualitiesText
                }
            ]
        }));
        scheduleAutoSave();
    };

    const handleRemoveArmour = (index) => {
        setCharacter(prev => ({
            ...prev,
            armour: prev.armour.filter((_, idx) => idx !== index)
        }));
        scheduleAutoSave();
    };

    const handleArmourFieldChange = (index, field, value) => {
        setCharacter(prev => ({
            ...prev,
            armour: prev.armour.map((a, idx) =>
                idx === index ? { ...a, [field]: value } : a
            )
        }));
        scheduleAutoSave();
    };

    return (
        <div className="card-section">
            <h3>{t('characterSheet.armour')}</h3>
            <table className="skills-table">
                <thead>
                    <tr>
                        <th>{t('characterSheet.name')}</th>
                        <th style={{ width: '100px' }}>{t('characterSheet.location')}</th>
                        <th style={{ width: '50px' }}>{t('characterSheet.enc')}</th>
                        <th style={{ width: '50px' }}>{t('characterSheet.ap')}</th>
                        <th>{t('characterSheet.qualities')}</th>
                        <th style={{ width: '40px' }}></th>
                    </tr>
                </thead>
                <tbody>
                    {character.armour?.map((armour, idx) => (
                        <tr key={idx}>
                            <td><input type="text" value={armour.name || ''} onChange={(e) => handleArmourFieldChange(idx, 'name', e.target.value)} /></td>
                            <td><input type="text" value={armour.locations || ''} onChange={(e) => handleArmourFieldChange(idx, 'locations', e.target.value)} /></td>
                            <td><input type="text" value={armour.enc || ''} onChange={(e) => handleArmourFieldChange(idx, 'enc', e.target.value)} /></td>
                            <td><input type="text" value={armour.ap || ''} onChange={(e) => handleArmourFieldChange(idx, 'ap', e.target.value)} /></td>
                            <td><input type="text" value={armour.qualities || ''} onChange={(e) => handleArmourFieldChange(idx, 'qualities', e.target.value)} /></td>
                            <td>
                                <button
                                    className="skill-delete-btn"
                                    onClick={() => handleRemoveArmour(idx)}
                                    title={t('common.delete')}
                                >
                                    ×
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div style={{ marginTop: '10px' }}>
                <select
                    onChange={(e) => {
                        handleAddArmour(e.target.value);
                        e.target.value = '';
                    }}
                >
                    <option value="">{t('characterSheet.addArmour')}</option>
                    {armourOptions.map(option => (
                        <option key={option.key} value={option.key}>
                            {option.displayName}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}

export default ArmourSection;
