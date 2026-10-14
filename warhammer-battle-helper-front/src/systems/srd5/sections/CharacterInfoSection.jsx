import React from 'react';
import { useTranslation } from 'react-i18next';
import AvatarUpload from '../../../components/common/AvatarUpload';
import NumberInput from '../../../components/common/NumberInput';

function CharacterInfoSection({ charName, charAvatar, info, appearance, onNameChange, onAvatarChange, onInfoChange, onAppearanceChange }) {
  const { t } = useTranslation();
  return (
    <div className="srd-section">
      <h4 className="srd-section-title">{t('srd.characterInfo')}</h4>

      {/* Zone A: Avatar + core identity */}
      <div className="srd-info-header">
        <AvatarUpload currentAvatar={charAvatar} onAvatarChange={onAvatarChange} />
        <div className="srd-info-core">
          <label>{t('srd.name')}</label>
          <input value={charName} onChange={e => onNameChange(e.target.value)} />
          <label>{t('srd.class')}</label>
          <input value={info.class || ''} onChange={e => onInfoChange('class', e.target.value)} />
          <label>{t('srd.subclass')}</label>
          <input value={info.subclass || ''} onChange={e => onInfoChange('subclass', e.target.value)} />
          <label>{t('srd.level')}</label>
          <NumberInput min={1} max={20} value={info.level || 1} onChange={e => onInfoChange('level', parseInt(e.target.value) || 1)} style={{ width: 52 }} />
          <label>{t('srd.xp')}</label>
          <NumberInput min={0} value={info.xp || 0} onChange={e => onInfoChange('xp', parseInt(e.target.value) || 0)} style={{ width: 80 }} />
        </div>
      </div>

      {/* Zone B: Context fields — 3-column stacked */}
      <div className="srd-info-context-grid">
        {['species', 'background', 'alignment'].map(field => (
          <div key={field} className="srd-info-context-grid__cell">
            <span className="srd-info-context-grid__label">{t(`srd.${field}`)}</span>
            <input
              className="srd-info-context-grid__input"
              value={info[field] || ''}
              onChange={e => onInfoChange(field, e.target.value)}
            />
          </div>
        ))}
      </div>

      {/* Zone C: Appearance — 3×2 grid */}
      <div className="srd-appearance-subgrid">
        {['age', 'height', 'weight', 'eyes', 'skin', 'hair'].map(field => (
          <div key={field} className="srd-appearance-subgrid__cell">
            <span className="srd-appearance-subgrid__label">{t(`srd.${field}`)}</span>
            <input
              className="srd-appearance-subgrid__input"
              value={(appearance && appearance[field]) || ''}
              onChange={e => onAppearanceChange(field, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default CharacterInfoSection;
