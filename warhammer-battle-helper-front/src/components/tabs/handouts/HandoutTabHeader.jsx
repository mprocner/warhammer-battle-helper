import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

function HandoutTabHeader({ isGM, onOpenCreate, onFolderCreated }) {
  const { t } = useTranslation();
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    await onFolderCreated(trimmed);
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  return (
    <>
      <div className="handouts-tab__header">
        <h3 className="handouts-tab__title">{t('handouts.title')}</h3>
        {isGM && (
          <div className="handouts-tab__header-actions">
            <button className="handouts-tab__add-btn" onClick={onOpenCreate}>
              + {t('handouts.addHandout')}
            </button>
            <button
              className="handouts-tab__add-btn"
              onClick={() => setIsCreatingFolder((v) => !v)}
            >
              + {t('handouts.folders.createFolder')}
            </button>
          </div>
        )}
      </div>

      {isGM && isCreatingFolder && (
        <form className="handouts-tab__folder-form" onSubmit={handleSubmit}>
          <input
            className="handouts-tab__folder-input"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={t('handouts.folders.namePlaceholder')}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Escape') setIsCreatingFolder(false); }}
          />
          <button className="handouts-tab__folder-submit" type="submit">
            {t('common.create')}
          </button>
          <button
            className="handouts-tab__folder-cancel"
            type="button"
            onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }}
          >
            {t('common.cancel')}
          </button>
        </form>
      )}
    </>
  );
}

export default HandoutTabHeader;
