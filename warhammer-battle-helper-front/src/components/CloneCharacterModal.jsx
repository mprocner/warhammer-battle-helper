import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

function CloneCharacterModal({ character, onConfirm, onCancel }) {
  const { t } = useTranslation();
  const [count, setCount] = useState(1);

  const handleConfirm = () => {
    onConfirm(count);
  };

  return (
    <div className="clone-modal-overlay" onClick={onCancel}>
      <div className="clone-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t('character.cloneTitle')}</h3>
        <p className="clone-modal__character-name">{character.basicInfo?.name}</p>
        <label className="clone-modal__label">
          {t('character.cloneCount')}
          <input
            type="number"
            min="1"
            max="20"
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
            className="clone-modal__input"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
              if (e.key === 'Escape') onCancel();
            }}
          />
        </label>
        <div className="clone-modal__actions">
          <button className="clone-modal__btn clone-modal__btn--cancel" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button className="clone-modal__btn clone-modal__btn--confirm" onClick={handleConfirm}>
            {t('character.cloneConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CloneCharacterModal;
