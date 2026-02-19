import React from 'react';
import { useTranslation } from 'react-i18next';
import AvatarUpload from '../AvatarUpload';

function CharacterInfoSection({ character, onFieldChange }) {
    const { t } = useTranslation();

    return (
        <div className="card-section">
            <h3>{t('characterSheet.characterInformation')}</h3>
            <div className="character-info-with-avatar">
                <AvatarUpload
                    currentAvatar={character.basicInfo?.avatar}
                    onAvatarChange={(url) => onFieldChange('basicInfo.avatar', url)}
                />
                <div className="character-info-fields">
                    <div className="form-grid">
                        <div className="form-group">
                            <label>{t('characterSheet.name')}</label>
                            <input
                                type="text"
                                value={character.basicInfo?.name || ''}
                                onChange={(e) => onFieldChange('basicInfo.name', e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('characterSheet.species')}</label>
                            <input
                                type="text"
                                value={character.basicInfo?.species || ''}
                                onChange={(e) => onFieldChange('basicInfo.species', e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('characterSheet.class')}</label>
                            <input
                                type="text"
                                value={character.basicInfo?.class || ''}
                                onChange={(e) => onFieldChange('basicInfo.class', e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="form-grid" style={{ marginTop: '10px' }}>
                        <div className="form-group">
                            <label>{t('characterSheet.career')}</label>
                            <input
                                type="text"
                                value={character.basicInfo?.career || ''}
                                onChange={(e) => onFieldChange('basicInfo.career', e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('characterSheet.careerLevel')}</label>
                            <input
                                type="text"
                                value={character.basicInfo?.careerLevel || ''}
                                onChange={(e) => onFieldChange('basicInfo.careerLevel', e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('characterSheet.status')}</label>
                            <input
                                type="text"
                                value={character.basicInfo?.status || ''}
                                onChange={(e) => onFieldChange('basicInfo.status', e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="form-group" style={{ marginTop: '10px' }}>
                        <label>{t('characterSheet.careerPath')}</label>
                        <input
                            type="text"
                            value={character.basicInfo?.careerPath || ''}
                            onChange={(e) => onFieldChange('basicInfo.careerPath', e.target.value)}
                        />
                    </div>
                    <div className="form-grid" style={{ marginTop: '10px' }}>
                        <div className="form-group">
                            <label>{t('characterSheet.age')}</label>
                            <input
                                type="text"
                                value={character.basicInfo?.age || ''}
                                onChange={(e) => onFieldChange('basicInfo.age', e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('characterSheet.height')}</label>
                            <input
                                type="text"
                                value={character.basicInfo?.height || ''}
                                onChange={(e) => onFieldChange('basicInfo.height', e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>{t('characterSheet.hair')}</label>
                            <input
                                type="text"
                                value={character.basicInfo?.hair || ''}
                                onChange={(e) => onFieldChange('basicInfo.hair', e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="form-group" style={{ marginTop: '10px' }}>
                        <label>{t('characterSheet.eyes')}</label>
                        <input
                            type="text"
                            value={character.basicInfo?.eyes || ''}
                            onChange={(e) => onFieldChange('basicInfo.eyes', e.target.value)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default CharacterInfoSection;
