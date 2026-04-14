import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

function BackstorySection({ stats, onFieldChange, onAppearanceChange }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="dnd-section">
      <div className="dnd-backstory-header" onClick={() => setExpanded(prev => !prev)}>
        <h4 className="dnd-section-title" style={{ margin: 0 }}>{t('dnd.characterDetails')}</h4>
        <button className="dnd-backstory-header__toggle" type="button">
          {expanded ? <ExpandLessIcon style={{ fontSize: 18 }} /> : <ExpandMoreIcon style={{ fontSize: 18 }} />}
        </button>
      </div>

      {expanded && (
        <div className="dnd-backstory-content">
          <div>
            <div className="dnd-backstory-content__label">{t('dnd.otherProficiencies')}</div>
            <textarea
              className="dnd-notes-textarea"
              value={stats.otherProficiencies || ''}
              onChange={e => onFieldChange('otherProficiencies', e.target.value)}
              rows={3}
              placeholder={t('dnd.otherProficienciesPlaceholder')}
            />
          </div>

          <div>
            <div className="dnd-backstory-content__label">{t('dnd.characterAppearance')}</div>
            <textarea
              className="dnd-notes-textarea"
              value={stats.appearance?.description || ''}
              onChange={e => onAppearanceChange('description', e.target.value)}
              rows={3}
              placeholder={t('dnd.appearancePlaceholder')}
            />
          </div>

          <div>
            <div className="dnd-backstory-content__label">{t('dnd.alliesOrganizations')}</div>
            <textarea
              className="dnd-notes-textarea"
              value={stats.alliesOrganizations || ''}
              onChange={e => onFieldChange('alliesOrganizations', e.target.value)}
              rows={3}
              placeholder={t('dnd.alliesOrganizationsPlaceholder')}
            />
          </div>

          <div>
            <div className="dnd-backstory-content__label">{t('dnd.characterBackstory')}</div>
            <textarea
              className="dnd-notes-textarea"
              value={stats.backstory || ''}
              onChange={e => onFieldChange('backstory', e.target.value)}
              rows={6}
              placeholder={t('dnd.backstoryPlaceholder')}
            />
          </div>

          <div>
            <div className="dnd-backstory-content__label">{t('dnd.treasure')}</div>
            <textarea
              className="dnd-notes-textarea"
              value={stats.treasure || ''}
              onChange={e => onFieldChange('treasure', e.target.value)}
              rows={3}
              placeholder={t('dnd.treasurePlaceholder')}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default BackstorySection;
