import React from 'react';
import { useTranslation } from 'react-i18next';

function PersonalitySection({ stats, onFieldChange }) {
  const { t } = useTranslation();

  const fields = [
    { key: 'personalityTraits', label: t('srd.personalityTraits'), placeholder: t('srd.personalityTraitsPlaceholder') },
    { key: 'ideals',            label: t('srd.ideals'),            placeholder: t('srd.idealsPlaceholder') },
    { key: 'bonds',             label: t('srd.bonds'),             placeholder: t('srd.bondsPlaceholder') },
    { key: 'flaws',             label: t('srd.flaws'),             placeholder: t('srd.flawsPlaceholder') },
  ];

  return (
    <div className="srd-section">
      <h4 className="srd-section-title">{t('srd.personality')}</h4>
      <div className="srd-personality-grid">
        {fields.map(f => (
          <div key={f.key} className="srd-personality-grid__cell">
            <span className="srd-personality-grid__label">{f.label}</span>
            <textarea
              className="srd-notes-textarea"
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
