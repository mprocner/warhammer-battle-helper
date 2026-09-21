import React from 'react';
import { useTranslation } from 'react-i18next';
import CustomSheetBody from '../../systems/custom/CustomSheetBody';

// The creator's Preview tab renders fields through the very same CustomSheetBody the session
// uses, so field-level markup cannot drift from the real thing. The wrapper around it is NOT
// shared, though: this tab has its own `.creator__prev-sheet` chrome (top bar, header, name/
// label) instead of `.custom-sheet`'s padding, width cap and character-name input — differences
// here won't surface in the session, and vice versa (that gap is what hid FEATURE-212's
// content-width bug: this preview never had `.custom-sheet`'s cap to expose it).
function TemplatePreview({ sections, name, width }) {
  const { t } = useTranslation();
  if (sections.length === 0) {
    return (
      <div className="creator__preview">
        <div className="creator__prev-empty">
          {t('creator.previewNoSections')}
        </div>
      </div>
    );
  }

  return (
    <div className="creator__preview">
      <div className="creator__prev-sheet" style={{ maxWidth: width }}>
        <div className="creator__prev-sheet-top" />
        <div className="creator__prev-sheet-header">
          <div className="creator__prev-system-name">{name || t('creator.previewDefaultName')}</div>
          <div className="creator__prev-system-label">{t('creator.previewSubtitle')}</div>
        </div>
        <div className="creator__prev-body">
          <CustomSheetBody sections={sections} />
        </div>
      </div>
    </div>
  );
}

export default TemplatePreview;
