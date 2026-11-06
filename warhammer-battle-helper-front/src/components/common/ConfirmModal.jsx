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
      {/* Escape cancels here and stops, so a dialog the modal was opened from does not read the
          same keydown as its own close. */}
      <div
        className="confirm-modal"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}
      >
        <p className="confirm-modal__message">{message}</p>
        <div className="confirm-modal__actions">
          {/* Focused on open: keydowns start inside the modal, and Enter picks the safe choice. */}
          <button type="button" onClick={onCancel} disabled={isLoading} autoFocus>
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
