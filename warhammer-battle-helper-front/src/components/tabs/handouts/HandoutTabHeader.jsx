import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import TabHeader from '../TabHeader';

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
      <TabHeader title={t('handouts.title')} tourId="handouts">
        {isGM && (
          <div className="handouts-tab__header-actions">
            <button className="tab-header__btn handouts-tab__add-btn" onClick={onOpenCreate}>
              <AddIcon fontSize="small" />
              {t('handouts.addHandoutShort')}
            </button>
            <button
              className="tab-header__btn handouts-tab__add-btn"
              onClick={() => setIsCreatingFolder((v) => !v)}
            >
              <AddIcon fontSize="small" />
              {t('handouts.folders.createFolder')}
            </button>
          </div>
        )}
      </TabHeader>

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
