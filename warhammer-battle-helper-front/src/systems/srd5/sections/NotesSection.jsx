import React from 'react';
import { useTranslation } from 'react-i18next';

function NotesSection({ notes, equipment, onNotesChange, onEquipmentChange }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="srd-section">
        <h4 className="srd-section-title">{t('srd.equipment')}</h4>
        <textarea
          className="srd-notes-textarea"
          value={equipment || ''}
          onChange={e => onEquipmentChange(e.target.value)}
          rows={4}
          placeholder={t('srd.equipmentPlaceholder')}
        />
      </div>
      <div className="srd-section">
        <h4 className="srd-section-title">{t('srd.notes')}</h4>
        <textarea
          className="srd-notes-textarea"
          value={notes || ''}
          onChange={e => onNotesChange(e.target.value)}
          rows={4}
          placeholder={t('srd.notesPlaceholder')}
        />
      </div>
    </>
  );
}

export default NotesSection;
