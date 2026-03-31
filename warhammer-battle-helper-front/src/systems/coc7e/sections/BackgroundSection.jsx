import React from 'react';
import { useTranslation } from 'react-i18next';

const BACKGROUND_FIELDS = [
  ['personalDescription', 'coc.personalDescription'],
  ['ideology', 'coc.ideology'],
  ['significantPeople', 'coc.significantPeople'],
  ['meaningfulLocations', 'coc.meaningfulLocations'],
  ['possessions', 'coc.treasuredPossessions'],
  ['traits', 'coc.traits'],
  ['injuriesScars', 'coc.injuries'],
  ['phobiasManias', 'coc.phobiasManias'],
  ['arcaneTomes', 'coc.arcaneTomesSpells'],
  ['encountersWithEntities', 'coc.encountersWithEntities'],
];

function BackgroundSection({ edited, onFieldChange }) {
  const { t } = useTranslation();
  return (
    <div className="coc-section">
      <h4 className="coc-section-title">{t('coc.background')}</h4>
      <div className="coc-bg-grid">
        {BACKGROUND_FIELDS.map(([key, labelKey]) => (
          <div key={key} className="coc-bg-field">
            <label className="coc-bg-label">{t(labelKey)}</label>
            <textarea
              className="coc-bg-textarea"
              value={edited[key] || ''}
              onChange={e => onFieldChange(key, e.target.value)}
              rows={3}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default BackgroundSection;
