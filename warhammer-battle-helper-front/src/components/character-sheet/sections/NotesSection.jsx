import React from 'react';
import { useTranslation } from 'react-i18next';

function NotesSection({ character, onFieldChange }) {
    const { t } = useTranslation();

    return (
        <>
            <div className="card-section">
                <h3>{t('characterSheet.ambitions')}</h3>
                <div className="form-group">
                    <label>{t('characterSheet.shortTerm')}</label>
                    <input
                        type="text"
                        value={character.ambitions?.shortTerm || ''}
                        onChange={(e) => onFieldChange('ambitions.shortTerm', e.target.value)}
                    />
                </div>
                <div className="form-group" style={{ marginTop: '8px' }}>
                    <label>{t('characterSheet.longTerm')}</label>
                    <input
                        type="text"
                        value={character.ambitions?.longTerm || ''}
                        onChange={(e) => onFieldChange('ambitions.longTerm', e.target.value)}
                    />
                </div>
            </div>

            <div className="card-section">
                <h3>{t('characterSheet.party')}</h3>
                <div className="form-group">
                    <label>{t('characterSheet.partyName')}</label>
                    <input
                        type="text"
                        value={character.party?.name || ''}
                        onChange={(e) => onFieldChange('party.name', e.target.value)}
                    />
                </div>
                <div className="form-group" style={{ marginTop: '8px' }}>
                    <label>{t('characterSheet.members')}</label>
                    <textarea
                        className="notes"
                        style={{ minHeight: '60px' }}
                        value={character.party?.members || ''}
                        onChange={(e) => onFieldChange('party.members', e.target.value)}
                    />
                </div>
            </div>

            <div className="card-section">
                <h3>{t('characterSheet.trappings')}</h3>
                <textarea
                    className="notes"
                    value={character.trappings || ''}
                    onChange={(e) => onFieldChange('trappings', e.target.value)}
                />
            </div>
        </>
    );
}

export default NotesSection;
