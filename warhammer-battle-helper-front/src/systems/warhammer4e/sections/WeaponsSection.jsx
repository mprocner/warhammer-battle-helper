import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import CloseIcon from '@mui/icons-material/Close';
import weaponsData from '../../../data/weapons.json';
import axiosInstance from '../../../api/axios';
import { buildPayload } from '../buildPayload';

function WeaponsSection({ character, setCharacter, scheduleAutoSave, onCharacterUpdate, getCharacterSaveUrl }) {
    const { t } = useTranslation(['translation', 'skills', 'weapons']);

    const weaponOptions = useMemo(() => {
        return weaponsData.map(weapon => {
            const [weaponCategory, weaponType] = weapon.type.split('_');
            let typeTranslation = '';
            if (weaponCategory === 'MELEE') {
                typeTranslation = t(`skills:MELEE.specialisations.${weaponType}`);
            } else if (weaponCategory === 'RANGED') {
                typeTranslation = t(`skills:RANGED.specialisations.${weaponType}`);
            }
            const weaponName = t(`weapons:weapons.${weapon.key}.name`);
            return {
                key: weapon.key,
                name: weaponName,
                displayName: `${weaponName} (${typeTranslation})`,
                type: weapon.type
            };
        });
    }, [t]);

    const handleAddWeapon = (weaponKey) => {
        if (!weaponKey) return;
        const weaponDef = weaponsData.find(w => w.key === weaponKey);
        if (!weaponDef) return;

        const weaponName = t(`weapons:weapons.${weaponDef.key}.name`);
        const [weaponCategory, weaponType] = weaponDef.type.split('_');
        let typeTranslation = '';
        if (weaponCategory === 'MELEE') {
            typeTranslation = t(`skills:MELEE.specialisations.${weaponType}`);
        } else if (weaponCategory === 'RANGED') {
            typeTranslation = t(`skills:RANGED.specialisations.${weaponType}`);
        }

        let damageText = '';
        if (weaponDef.damage) {
            if (weaponDef.damage.attribute) {
                damageText = weaponDef.damage.attribute === 'STRENGTH' ? 'SB' : 'BB';
                if (weaponDef.damage.bonus > 0) damageText += `+${weaponDef.damage.bonus}`;
                else if (weaponDef.damage.bonus < 0) damageText += weaponDef.damage.bonus;
            } else if (weaponDef.damage.bonus) {
                damageText = weaponDef.damage.bonus.toString();
            }
        }

        let rangeReachText = '';
        if (weaponDef.reach) {
            rangeReachText = t(`weapons:reaches.${weaponDef.reach}`);
        } else if (weaponDef.range) {
            if (weaponDef.range.value !== null) {
                rangeReachText = weaponDef.range.value.toString();
            } else if (weaponDef.range.attribute) {
                const attr = weaponDef.range.attribute === 'STRENGTH' ? 'SB' : 'BB';
                const mult = weaponDef.range.multiplier || 1;
                rangeReachText = mult > 1 ? `${attr}x${mult}` : attr;
            }
        }

        const qualitiesText = weaponDef.qualities
            ? weaponDef.qualities.map(q => t(`weapons:qualities.${q}`)).join(', ')
            : '';

        setCharacter(prev => ({
            ...prev,
            weapons: [
                ...(prev.weapons || []),
                {
                    name: weaponName,
                    group: typeTranslation,
                    enc: weaponDef.encumbrance.toString(),
                    range: rangeReachText,
                    damage: damageText,
                    qualities: qualitiesText,
                    skill: weaponDef.type,
                    isFavourite: false
                }
            ]
        }));
        scheduleAutoSave();
    };

    const handleToggleFavoriteWeapon = async (index) => {
        const updatedWeapons = character.weapons.map((w, idx) =>
            idx === index ? { ...w, isFavourite: !w.isFavourite } : w
        );
        const updatedCharacter = { ...character, weapons: updatedWeapons };
        setCharacter(updatedCharacter);

        try {
            await axiosInstance.put(getCharacterSaveUrl(updatedCharacter.id), buildPayload(updatedCharacter));
            if (onCharacterUpdate) onCharacterUpdate(updatedCharacter);
        } catch (error) {
            console.error('Error saving character:', error);
            alert('Failed to save character: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleRemoveWeapon = (index) => {
        setCharacter(prev => ({
            ...prev,
            weapons: prev.weapons.filter((_, idx) => idx !== index)
        }));
        scheduleAutoSave();
    };

    const handleWeaponFieldChange = (index, field, value) => {
        setCharacter(prev => ({
            ...prev,
            weapons: prev.weapons.map((w, idx) =>
                idx === index ? { ...w, [field]: value } : w
            )
        }));
        scheduleAutoSave();
    };

    return (
        <div className="card-section">
            <h3>{t('characterSheet.weapons')}</h3>
            <table className="skills-table">
                <thead>
                    <tr>
                        <th style={{ width: '30px' }}><StarIcon style={{ fontSize: 14, color: '#c9975b', verticalAlign: 'middle' }} /></th>
                        <th>{t('characterSheet.name')}</th>
                        <th style={{ width: '70px' }}>{t('characterSheet.group')}</th>
                        <th style={{ width: '50px' }}>{t('characterSheet.enc')}</th>
                        <th style={{ width: '80px' }}>{t('characterSheet.rangeReach')}</th>
                        <th style={{ width: '70px' }}>{t('characterSheet.damage')}</th>
                        <th>{t('characterSheet.qualities')}</th>
                        <th style={{ width: '40px' }}></th>
                    </tr>
                </thead>
                <tbody>
                    {character.weapons?.map((weapon, idx) => (
                        <tr key={idx}>
                            <td style={{ textAlign: 'center' }}>
                                <span
                                    onClick={() => handleToggleFavoriteWeapon(idx)}
                                    className="skill-favorite-btn"
                                    title={weapon.isFavourite ? t('characterSheet.removeFromFavorites') : t('characterSheet.addToFavorites')}
                                >
                                    {weapon.isFavourite
                                        ? <StarIcon style={{ fontSize: 16, color: '#c9975b' }} />
                                        : <StarBorderIcon style={{ fontSize: 16, color: '#c9975b' }} />
                                    }
                                </span>
                            </td>
                            <td><input type="text" value={weapon.name || ''} onChange={(e) => handleWeaponFieldChange(idx, 'name', e.target.value)} /></td>
                            <td><input type="text" value={weapon.group || ''} onChange={(e) => handleWeaponFieldChange(idx, 'group', e.target.value)} /></td>
                            <td><input type="text" value={weapon.enc || ''} onChange={(e) => handleWeaponFieldChange(idx, 'enc', e.target.value)} /></td>
                            <td><input type="text" value={weapon.range || ''} onChange={(e) => handleWeaponFieldChange(idx, 'range', e.target.value)} /></td>
                            <td><input type="text" value={weapon.damage || ''} onChange={(e) => handleWeaponFieldChange(idx, 'damage', e.target.value)} /></td>
                            <td><input type="text" value={weapon.qualities || ''} onChange={(e) => handleWeaponFieldChange(idx, 'qualities', e.target.value)} /></td>
                            <td>
                                <button
                                    className="skill-delete-btn"
                                    onClick={() => handleRemoveWeapon(idx)}
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
                <select
                    onChange={(e) => {
                        handleAddWeapon(e.target.value);
                        e.target.value = '';
                    }}
                >
                    <option value="">{t('characterSheet.addWeapon')}</option>
                    {weaponOptions.map(option => (
                        <option key={option.key} value={option.key}>
                            {option.displayName}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}

export default WeaponsSection;
