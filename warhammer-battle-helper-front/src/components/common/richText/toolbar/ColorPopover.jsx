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
    <div className="rich-toolbar__popover rich-toolbar__color-popover" role="dialog">
      <div className="rich-toolbar__swatches">
        {colors.map(({ key, hex }) => (
          <button
            key={key}
            type="button"
            className={`rich-toolbar__swatch ${active === hex ? 'rich-toolbar__swatch--active' : ''}`}
            style={{ backgroundColor: hex }}
            aria-label={t(`richText.toolbar.colors.${key}`)}
            aria-pressed={active === hex}
            onMouseDown={preventFocusLoss}
            onClick={() => onSelect(hex)}
          />
        ))}
      </div>
      <label className="rich-toolbar__custom-color">
        <input type="color" value={pickerValue} onChange={(e) => onCustom(e.target.value)} />
        {customLabel}
      </label>
      {onClear && (
        <button type="button" className="rich-toolbar__text-btn" onMouseDown={preventFocusLoss} onClick={onClear}>
          {clearLabel}
        </button>
      )}
    </div>
  );
};

export default ColorPopover;
