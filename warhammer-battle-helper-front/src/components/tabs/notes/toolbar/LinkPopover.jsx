import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeHref } from '../noteFormatting';

// Mounted fresh on every open, so initialHref only seeds the field once.
const LinkPopover = ({ initialHref, onApply, onRemove }) => {
  const { t } = useTranslation();
  const [href, setHref] = useState(initialHref ?? '');
  const inputRef = useRef(null);

  // Focus leaves the editor here; the editor keeps its selection in state and the
  // apply/remove commands restore it with chain().focus().
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const normalized = normalizeHref(href);
    if (normalized) onApply(normalized);
    else onRemove();
  };

  return (
    <form className="note-toolbar__popover note-toolbar__link-popover" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        className="note-toolbar__link-input"
        type="text"
        value={href}
        placeholder={t('notes.toolbar.linkPlaceholder')}
        aria-label={t('notes.toolbar.linkUrl')}
        onChange={(e) => setHref(e.target.value)}
      />
      <div className="note-toolbar__link-actions">
        <button type="submit" className="note-toolbar__text-btn">{t('notes.toolbar.applyLink')}</button>
        {initialHref && (
          <button type="button" className="note-toolbar__text-btn" onClick={onRemove}>
            {t('notes.toolbar.removeLink')}
          </button>
        )}
      </div>
    </form>
  );
};

export default LinkPopover;
