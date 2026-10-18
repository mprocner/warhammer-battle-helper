import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeHref } from '../richTextFormatting';

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
    <form className="rich-toolbar__popover rich-toolbar__link-popover" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        className="rich-toolbar__link-input"
        type="text"
        value={href}
        placeholder={t('richText.toolbar.linkPlaceholder')}
        aria-label={t('richText.toolbar.linkUrl')}
        onChange={(e) => setHref(e.target.value)}
      />
      <div className="rich-toolbar__link-actions">
        <button type="submit" className="rich-toolbar__text-btn">{t('richText.toolbar.applyLink')}</button>
        {initialHref && (
          <button type="button" className="rich-toolbar__text-btn" onClick={onRemove}>
            {t('richText.toolbar.removeLink')}
          </button>
        )}
      </div>
    </form>
  );
};

export default LinkPopover;
