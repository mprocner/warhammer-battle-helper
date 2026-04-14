import React from 'react';
import { useTranslation } from 'react-i18next';
import AvatarUpload from '../../../components/common/AvatarUpload';

function CharacterInfoSection({ charName, charAvatar, info, appearance, onNameChange, onAvatarChange, onInfoChange, onAppearanceChange }) {
  const { t } = useTranslation();
  return (
    <div className="dnd-section">
      <h4 className="dnd-section-title">{t('dnd.characterInfo')}</h4>

      {/* Zone A: Avatar + core identity */}
      <div className="dnd-info-header">
        <AvatarUpload currentAvatar={charAvatar} onAvatarChange={onAvatarChange} />
        <div className="dnd-info-core">
          <label>{t('dnd.name')}</label>
          <input value={charName} onChange={e => onNameChange(e.target.value)} />
          <label>{t('dnd.class')}</label>
          <input value={info.class || ''} onChange={e => onInfoChange('class', e.target.value)} />
          <label>{t('dnd.subclass')}</label>
          <input value={info.subclass || ''} onChange={e => onInfoChange('subclass', e.target.value)} />
          <label>{t('dnd.level')}</label>
          <input type="number" min={1} max={20} value={info.level || 1} onChange={e => onInfoChange('level', parseInt(e.target.value) || 1)} style={{ width: 52 }} />
          <label>{t('dnd.xp')}</label>
          <input type="number" min={0} value={info.xp || 0} onChange={e => onInfoChange('xp', parseInt(e.target.value) || 0)} style={{ width: 80 }} />
        </div>
      </div>

      {/* Zone B: Context fields — 3-column stacked */}
      <div className="dnd-info-context-grid">
        {['species', 'background', 'alignment'].map(field => (
          <div key={field} className="dnd-info-context-grid__cell">
            <span className="dnd-info-context-grid__label">{t(`dnd.${field}`)}</span>
            <input
              className="dnd-info-context-grid__input"
              value={info[field] || ''}
              onChange={e => onInfoChange(field, e.target.value)}
            />
          </div>
        ))}
      </div>

      {/* Zone C: Appearance — 3×2 grid */}
      <div className="dnd-appearance-subgrid">
        {['age', 'height', 'weight', 'eyes', 'skin', 'hair'].map(field => (
          <div key={field} className="dnd-appearance-subgrid__cell">
            <span className="dnd-appearance-subgrid__label">{t(`dnd.${field}`)}</span>
            <input
              className="dnd-appearance-subgrid__input"
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
