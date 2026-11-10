import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { THEMES, resolveTheme } from '../../theme/themes';

// The GM's theme choice in the General tab. Each tile previews its theme with literal colours
// (THEMES[].swatch) and its display font, so it reads correctly while another theme is active.
const ThemePicker = ({ value, onChange }) => {
  const { t } = useTranslation();
  const current = resolveTheme(value, false);

  // Tiles name each theme in its own font; fetch them when the GM opens the picker.
  useEffect(() => {
    THEMES.forEach(theme => { if (theme.loadFonts) theme.loadFonts().catch(() => {}); });
  }, []);

  return (
    <div className="theme-picker" role="radiogroup" aria-label={t('settings.appearance.choose')}>
      {THEMES.map(({ id, swatch, displayFont }) => {
        const active = id === current;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            className={`theme-picker__option${active ? ' theme-picker__option--active' : ''}`}
            onClick={() => { if (!active) onChange(id); }}
          >
            <span
              className="theme-picker__swatch"
              aria-hidden="true"
              style={{ background: swatch.bg, borderColor: swatch.border, color: swatch.text, fontFamily: displayFont }}
            >
              <span className="theme-picker__swatch-panel" style={{ background: swatch.panel }} />
              <span className="theme-picker__swatch-accent" style={{ background: swatch.accent }} />
              Aa
            </span>
            <span className="theme-picker__name">{t(`theme.names.${id}`)}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ThemePicker;
