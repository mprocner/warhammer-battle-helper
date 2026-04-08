import React from 'react';
import { useTranslation } from 'react-i18next';
import AvatarUpload from '../../../components/common/AvatarUpload';

function CharacterInfoSection({ charName, charAvatar, info, onNameChange, onAvatarChange, onInfoChange }) {
  const { t } = useTranslation();
  return (
    <div className="dnd-section">
      <h4 className="dnd-section-title">{t('dnd.characterInfo')}</h4>
      <div className="character-info-with-avatar">
        <AvatarUpload currentAvatar={charAvatar} onAvatarChange={onAvatarChange} />
        <div className="dnd-info-grid">
          <label>{t('dnd.name')}</label>
          <input value={charName} onChange={e => onNameChange(e.target.value)} />
          <label>{t('dnd.class')}</label>
          <input value={info.class || ''} onChange={e => onInfoChange('class', e.target.value)} />
          <label>{t('dnd.subclass')}</label>
          <input value={info.subclass || ''} onChange={e => onInfoChange('subclass', e.target.value)} />
          <label>{t('dnd.level')}</label>
          <input type="number" min={1} max={20} value={info.level || 1} onChange={e => onInfoChange('level', parseInt(e.target.value) || 1)} style={{ width: 60 }} />
          <label>{t('dnd.species')}</label>
          <input value={info.species || ''} onChange={e => onInfoChange('species', e.target.value)} />
          <label>{t('dnd.background')}</label>
          <input value={info.background || ''} onChange={e => onInfoChange('background', e.target.value)} />
          <label>{t('dnd.alignment')}</label>
          <input value={info.alignment || ''} onChange={e => onInfoChange('alignment', e.target.value)} />
          <label>{t('dnd.xp')}</label>
          <input type="number" min={0} value={info.xp || 0} onChange={e => onInfoChange('xp', parseInt(e.target.value) || 0)} style={{ width: 80 }} />
        </div>
      </div>
    </div>
  );
}

export default CharacterInfoSection;
