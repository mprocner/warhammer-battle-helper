import React from 'react';
import { useTranslation } from 'react-i18next';
import AvatarUpload from '../../../components/common/AvatarUpload';

function CharacterInfoSection({ charName, charAvatar, edited, onNameChange, onAvatarChange, onFieldChange }) {
  const { t } = useTranslation();
  return (
    <div className="coc-section">
      <h4 className="coc-section-title">{t('coc.characterInfo')}</h4>
      <div className="character-info-with-avatar">
        <AvatarUpload
          currentAvatar={charAvatar}
          onAvatarChange={onAvatarChange}
        />
        <div className="coc-info-grid">
          <label>{t('coc.name')}</label>
          <input value={charName} onChange={e => onNameChange(e.target.value)} />
          <label>{t('coc.occupation')}</label>
          <input value={edited.occupation || ''} onChange={e => onFieldChange('occupation', e.target.value)} />
          <label>{t('coc.age')}</label>
          <input type="number" value={edited.age || ''} onChange={e => onFieldChange('age', parseInt(e.target.value) || '')} style={{ width: 60 }} />
          <label>{t('coc.sex')}</label>
          <input value={edited.sex || ''} onChange={e => onFieldChange('sex', e.target.value)} />
          <label>{t('coc.residence')}</label>
          <input value={edited.residence || ''} onChange={e => onFieldChange('residence', e.target.value)} />
          <label>{t('coc.birthplace')}</label>
          <input value={edited.birthplace || ''} onChange={e => onFieldChange('birthplace', e.target.value)} />
        </div>
      </div>
    </div>
  );
}

export default CharacterInfoSection;
