import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './ConfirmModal.css';

const ConfirmModal = ({ isOpen, message, onConfirm, onCancel, confirmLabel, isLoading }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  // Portal to <body> so the overlay escapes any nested stacking context (e.g. a scene token or a
  // MUI Dialog it's launched from) and its z-index actually wins.
  return createPortal(
    <div className="confirm-modal-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <p className="confirm-modal__message">{message}</p>
        <div className="confirm-modal__actions">
          <button type="button" onClick={onCancel} disabled={isLoading}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="confirm-modal__btn--danger"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {confirmLabel || t('common.delete')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmModal;
