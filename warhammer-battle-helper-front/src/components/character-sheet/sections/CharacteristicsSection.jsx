import React from 'react';
import { useTranslation } from 'react-i18next';

const CHARACTERISTICS = ['WS', 'BS', 'S', 'T', 'I', 'Ag', 'Dex', 'Int', 'WP', 'Fel'];

const CHARACTERISTIC_LONG_KEY = {
    WS: 'WEAPON_SKILL',
    BS: 'BALLISTIC_SKILL',
    S: 'STRENGTH',
    T: 'TOUGHNESS',
    I: 'INITIATIVE',
    Ag: 'AGILITY',
    Dex: 'DEXTERITY',
    Int: 'INTELLIGENCE',
    WP: 'WILLPOWER',
    Fel: 'FELLOWSHIP'
};

function CharacteristicsSection({ character, onFieldChange, onCharacteristicClick }) {
    const { t } = useTranslation();

    return (
        <div className="card-section">
            <h3>{t('characterSheet.characteristics')}</h3>
            <table className="characteristics-table">
                <thead>
                    <tr>
                        <th style={{ width: '80px' }}></th>
                        {CHARACTERISTICS.map(stat => (
                            <th
                                key={stat}
                                onClick={(e) => onCharacteristicClick(stat, character.characteristics?.current?.[stat], e)}
                                style={{ cursor: 'pointer' }}
                                title={t('combat.rollTest', { characteristic: t(`characteristicsShort.${CHARACTERISTIC_LONG_KEY[stat]}`) })}
                            >
                                {t(`characteristicsShort.${CHARACTERISTIC_LONG_KEY[stat]}`)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="row-label">{t('characterSheet.initial')}</td>
                        {CHARACTERISTICS.map(stat => (
                            <td key={stat}>
                                <input
                                    type="text"
                                    value={character.characteristics?.initial?.[stat] || ''}
                                    onChange={(e) => onFieldChange(`characteristics.initial.${stat}`, e.target.value)}
                                />
                            </td>
                        ))}
                    </tr>
                    <tr>
                        <td className="row-label">{t('characterSheet.advances')}</td>
                        {CHARACTERISTICS.map(stat => (
                            <td key={stat}>
                                <input
                                    type="text"
                                    value={character.characteristics?.advances?.[stat] || ''}
                                    onChange={(e) => onFieldChange(`characteristics.advances.${stat}`, e.target.value)}
                                />
                            </td>
                        ))}
                    </tr>
                    <tr>
                        <td className="row-label">{t('characterSheet.current')}</td>
                        {CHARACTERISTICS.map(stat => (
                            <td key={stat}>
                                <input
                                    type="text"
                                    value={character.characteristics?.current?.[stat] || ''}
                                    readOnly
                                />
                            </td>
                        ))}
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

export default CharacteristicsSection;
