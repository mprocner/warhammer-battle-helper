import React from 'react';
import { useTranslation } from 'react-i18next';

function NotesSection({ notes, equipment, onNotesChange, onEquipmentChange }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="dnd-section">
        <h4 className="dnd-section-title">{t('dnd.equipment')}</h4>
        <textarea
          className="dnd-notes-textarea"
          value={equipment || ''}
          onChange={e => onEquipmentChange(e.target.value)}
          rows={4}
          placeholder={t('dnd.equipmentPlaceholder')}
        />
      </div>
      <div className="dnd-section">
        <h4 className="dnd-section-title">{t('dnd.notes')}</h4>
        <textarea
          className="dnd-notes-textarea"
          value={notes || ''}
          onChange={e => onNotesChange(e.target.value)}
          rows={4}
          placeholder={t('dnd.notesPlaceholder')}
        />
      </div>
    </>
  );
}

export default NotesSection;
