import React from 'react';
import { useTranslation } from 'react-i18next';

function PersonalitySection({ stats, onFieldChange }) {
  const { t } = useTranslation();

  const fields = [
    { key: 'personalityTraits', label: t('dnd.personalityTraits'), placeholder: t('dnd.personalityTraitsPlaceholder') },
    { key: 'ideals',            label: t('dnd.ideals'),            placeholder: t('dnd.idealsPlaceholder') },
    { key: 'bonds',             label: t('dnd.bonds'),             placeholder: t('dnd.bondsPlaceholder') },
    { key: 'flaws',             label: t('dnd.flaws'),             placeholder: t('dnd.flawsPlaceholder') },
  ];

  return (
    <div className="dnd-section">
      <h4 className="dnd-section-title">{t('dnd.personality')}</h4>
      <div className="dnd-personality-grid">
        {fields.map(f => (
          <div key={f.key} className="dnd-personality-grid__cell">
            <span className="dnd-personality-grid__label">{f.label}</span>
            <textarea
              className="dnd-notes-textarea"
              value={stats[f.key] || ''}
              onChange={e => onFieldChange(f.key, e.target.value)}
              rows={3}
              placeholder={f.placeholder}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default PersonalitySection;
