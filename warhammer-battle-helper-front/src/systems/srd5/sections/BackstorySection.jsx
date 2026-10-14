import React from 'react';
import { useTranslation } from 'react-i18next';

function BackstorySection({ stats, onFieldChange, onAppearanceChange }) {
  const { t } = useTranslation();

  return (
    <div className="srd-section">
      <h4 className="srd-section-title">{t('srd.characterDetails')}</h4>
      <div className="srd-backstory-content">
        <div>
          <div className="srd-backstory-content__label">{t('srd.otherProficiencies')}</div>
          <textarea
            className="srd-notes-textarea"
            value={stats.otherProficiencies || ''}
            onChange={e => onFieldChange('otherProficiencies', e.target.value)}
            rows={3}
            placeholder={t('srd.otherProficienciesPlaceholder')}
          />
        </div>

        <div>
          <div className="srd-backstory-content__label">{t('srd.characterAppearance')}</div>
          <textarea
            className="srd-notes-textarea"
            value={stats.appearance?.description || ''}
            onChange={e => onAppearanceChange('description', e.target.value)}
            rows={3}
            placeholder={t('srd.appearancePlaceholder')}
          />
        </div>

        <div>
          <div className="srd-backstory-content__label">{t('srd.alliesOrganizations')}</div>
          <textarea
            className="srd-notes-textarea"
            value={stats.alliesOrganizations || ''}
            onChange={e => onFieldChange('alliesOrganizations', e.target.value)}
            rows={3}
            placeholder={t('srd.alliesOrganizationsPlaceholder')}
          />
        </div>

        <div>
          <div className="srd-backstory-content__label">{t('srd.characterBackstory')}</div>
          <textarea
            className="srd-notes-textarea"
            value={stats.backstory || ''}
            onChange={e => onFieldChange('backstory', e.target.value)}
            rows={6}
            placeholder={t('srd.backstoryPlaceholder')}
          />
        </div>

        <div>
          <div className="srd-backstory-content__label">{t('srd.treasure')}</div>
          <textarea
            className="srd-notes-textarea"
            value={stats.treasure || ''}
            onChange={e => onFieldChange('treasure', e.target.value)}
            rows={3}
            placeholder={t('srd.treasurePlaceholder')}
          />
        </div>
      </div>
    </div>
  );
}

export default BackstorySection;
