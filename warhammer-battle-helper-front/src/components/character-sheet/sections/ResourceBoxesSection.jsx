import React from 'react';
import { useTranslation } from 'react-i18next';

function ResourceBoxesSection({ character, onFieldChange }) {
    const { t } = useTranslation();

    return (
        <>
            <div className="three-col-grid">
                <div className="mini-box">
                    <h4>{t('characterSheet.fateTitle')}</h4>
                    <div className="mini-field">
                        <label>{t('characterSheet.fate')}</label>
                        <input
                            type="text"
                            value={character.fate?.fate || ''}
                            onChange={(e) => onFieldChange('fate.fate', e.target.value)}
                        />
                    </div>
                    <div className="mini-field">
                        <label>{t('characterSheet.fortune')}</label>
                        <input
                            type="text"
                            value={character.fate?.fortune || ''}
                            onChange={(e) => onFieldChange('fate.fortune', e.target.value)}
                        />
                    </div>
                </div>
                <div className="mini-box">
                    <h4>{t('characterSheet.resilienceTitle')}</h4>
                    <div className="mini-field">
                        <label>{t('characterSheet.resilience')}</label>
                        <input
                            type="text"
                            value={character.resilience?.resilience || ''}
                            onChange={(e) => onFieldChange('resilience.resilience', e.target.value)}
                        />
                    </div>
                    <div className="mini-field">
                        <label>{t('characterSheet.resolve')}</label>
                        <input
                            type="text"
                            value={character.resilience?.resolve || ''}
                            onChange={(e) => onFieldChange('resilience.resolve', e.target.value)}
                        />
                    </div>
                    <div className="mini-field">
                        <label>{t('characterSheet.motivation')}</label>
                        <input
                            type="text"
                            style={{ width: '100%' }}
                            value={character.resilience?.motivation || ''}
                            onChange={(e) => onFieldChange('resilience.motivation', e.target.value)}
                        />
                    </div>
                </div>
                <div className="mini-box">
                    <h4>{t('characterSheet.experienceTitle')}</h4>
                    <div className="mini-field">
                        <label>{t('characterSheet.currentExperience')}</label>
                        <input
                            type="text"
                            value={character.experience?.current || ''}
                            onChange={(e) => onFieldChange('experience.current', e.target.value)}
                        />
                    </div>
                    <div className="mini-field">
                        <label>{t('characterSheet.spent')}</label>
                        <input
                            type="text"
                            value={character.experience?.spent || ''}
                            onChange={(e) => onFieldChange('experience.spent', e.target.value)}
                        />
                    </div>
                    <div className="mini-field">
                        <label>{t('characterSheet.total')}</label>
                        <input
                            type="text"
                            value={character.experience?.total || ''}
                            onChange={(e) => onFieldChange('experience.total', e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="card-section">
                <h3>{t('characterSheet.movement')}</h3>
                <div className="three-col-grid">
                    <div className="mini-field">
                        <label>{t('characterSheet.movement')}</label>
                        <input
                            type="text"
                            value={character.movement?.movement || ''}
                            onChange={(e) => onFieldChange('movement.movement', e.target.value)}
                        />
                    </div>
                    <div className="mini-field">
                        <label>{t('characterSheet.walk')}</label>
                        <input
                            type="text"
                            value={character.movement?.walk || ''}
                            onChange={(e) => onFieldChange('movement.walk', e.target.value)}
                        />
                    </div>
                    <div className="mini-field">
                        <label>{t('characterSheet.run')}</label>
                        <input
                            type="text"
                            value={character.movement?.run || ''}
                            onChange={(e) => onFieldChange('movement.run', e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="card-section">
                <h3>{t('characterSheet.wounds')}</h3>
                <div className="three-col-grid">
                    <div className="mini-field">
                        <label>{t('characterSheet.sb')}</label>
                        <input
                            type="number"
                            value={character.wounds?.sb ?? 0}
                            onChange={(e) => onFieldChange('wounds.sb', parseInt(e.target.value) || 0)}
                        />
                    </div>
                    <div className="mini-field">
                        <label>{t('characterSheet.tbPlus2')}</label>
                        <input
                            type="number"
                            value={character.wounds?.tb ?? 0}
                            onChange={(e) => onFieldChange('wounds.tb', parseInt(e.target.value) || 0)}
                        />
                    </div>
                    <div className="mini-field">
                        <label>{t('characterSheet.wpb')}</label>
                        <input
                            type="number"
                            value={character.wounds?.wpb ?? 0}
                            onChange={(e) => onFieldChange('wounds.wpb', parseInt(e.target.value) || 0)}
                        />
                    </div>
                    <div className="mini-field">
                        <label>{t('characterSheet.hardy')}</label>
                        <input
                            type="number"
                            value={character.wounds?.hardy ?? 0}
                            onChange={(e) => onFieldChange('wounds.hardy', parseInt(e.target.value) || 0)}
                        />
                    </div>
                    <div className="mini-field">
                        <label>{t('characterSheet.total')}</label>
                        <input
                            type="number"
                            value={character.wounds?.total ?? 0}
                            onChange={(e) => onFieldChange('wounds.total', parseInt(e.target.value) || 0)}
                        />
                    </div>
                </div>
            </div>
        </>
    );
}

export default ResourceBoxesSection;
