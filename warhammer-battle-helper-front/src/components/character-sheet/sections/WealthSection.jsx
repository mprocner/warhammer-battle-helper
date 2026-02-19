import React from 'react';
import { useTranslation } from 'react-i18next';

function WealthSection({ character, onFieldChange }) {
    const { t } = useTranslation();

    return (
        <div className="card-section">
            <h3>{t('characterSheet.wealth')}</h3>
            <div className="three-col-grid">
                <div className="mini-field">
                    <label>{t('characterSheet.brass')}</label>
                    <input
                        type="text"
                        value={character.wealth?.brass || ''}
                        onChange={(e) => onFieldChange('wealth.brass', e.target.value)}
                    />
                </div>
                <div className="mini-field">
                    <label>{t('characterSheet.silver')}</label>
                    <input
                        type="text"
                        value={character.wealth?.silver || ''}
                        onChange={(e) => onFieldChange('wealth.silver', e.target.value)}
                    />
                </div>
                <div className="mini-field">
                    <label>{t('characterSheet.gold')}</label>
                    <input
                        type="text"
                        value={character.wealth?.gold || ''}
                        onChange={(e) => onFieldChange('wealth.gold', e.target.value)}
                    />
                </div>
            </div>
            <p className="wealth-exchange-info">{t('characterSheet.wealthExchangeInfo')}</p>
        </div>
    );
}

export default WealthSection;
