import React from 'react';
import { useTranslation } from 'react-i18next';
import { preventFocusLoss } from './ToolbarButton';

const HEX_RE = /^#[0-9a-f]{6}$/i;

const ColorPopover = ({ colors, activeHex, onSelect, onCustom, onClear, clearLabel, customLabel }) => {
  const { t } = useTranslation();
  const active = activeHex?.toLowerCase();
  // <input type="color"> only accepts #rrggbb; anything else would reset it to black.
  const pickerValue = HEX_RE.test(activeHex ?? '') ? active : colors[0].hex;

  return (
    <div className="note-toolbar__popover note-toolbar__color-popover" role="dialog">
      <div className="note-toolbar__swatches">
        {colors.map(({ key, hex }) => (
          <button
            key={key}
            type="button"
            className={`note-toolbar__swatch ${active === hex ? 'note-toolbar__swatch--active' : ''}`}
            style={{ backgroundColor: hex }}
            aria-label={t(`notes.toolbar.colors.${key}`)}
            aria-pressed={active === hex}
            onMouseDown={preventFocusLoss}
            onClick={() => onSelect(hex)}
          />
        ))}
      </div>
      <label className="note-toolbar__custom-color">
        <input type="color" value={pickerValue} onChange={(e) => onCustom(e.target.value)} />
        {customLabel}
      </label>
      {onClear && (
        <button type="button" className="note-toolbar__text-btn" onMouseDown={preventFocusLoss} onClick={onClear}>
          {clearLabel}
        </button>
      )}
    </div>
  );
};

export default ColorPopover;
