import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import usePopoverDismiss from './usePopoverDismiss';
import { preventFocusLoss } from './ToolbarButton';
import { DEFAULT_FONT_SIZE, FONT_SIZE_PRESETS, parseFontSize } from '../noteFormatting';

const asDraft = (value) => (value == null ? '' : String(value));

const FontSizeCombo = ({ value, onApply, onShowTooltip, onHideTooltip }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(asDraft(value));
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const close = useCallback(() => setIsOpen(false), []);
  usePopoverDismiss(rootRef, isOpen, close);

  // The caret moved to text with another size: show that size.
  useEffect(() => { setDraft(asDraft(value)); }, [value]);

  const apply = (n) => {
    setDraft(String(n));
    setIsOpen(false);
    onApply(n);
  };

  const commitDraft = () => {
    const n = parseFontSize(draft);
    if (n == null) {
      setDraft(asDraft(value));
      return;
    }
    apply(n);
  };

  const label = t('notes.toolbar.fontSize');

  return (
    <div
      className="note-toolbar__anchor note-toolbar__size"
      ref={rootRef}
      onMouseEnter={(e) => { if (!isOpen) onShowTooltip?.(label, e.currentTarget); }}
      onMouseLeave={onHideTooltip}
    >
      <input
        className="note-toolbar__size-input"
        type="text"
        inputMode="numeric"
        value={draft}
        placeholder={String(DEFAULT_FONT_SIZE)}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitDraft();
          }
        }}
        // Applying only on Enter: a blur caused by clicking into the editor must not
        // apply a half-typed size to whatever the click selects.
        onBlur={() => setDraft(asDraft(value))}
      />
      <button
        type="button"
        className="note-toolbar__size-toggle"
        aria-label={t('notes.toolbar.fontSizePresets')}
        aria-expanded={isOpen}
        onMouseDown={preventFocusLoss}
        onClick={() => setIsOpen((open) => !open)}
      >
        <ArrowDropDownIcon fontSize="small" />
      </button>
      {isOpen && (
        <ul className="note-toolbar__popover note-toolbar__size-list" role="listbox">
          {FONT_SIZE_PRESETS.map((n) => (
            <li key={n}>
              <button
                type="button"
                role="option"
                aria-selected={n === value}
                className={`note-toolbar__size-option ${n === value ? 'note-toolbar__size-option--active' : ''}`}
                onMouseDown={preventFocusLoss}
                onClick={() => apply(n)}
              >
                {n}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FontSizeCombo;
