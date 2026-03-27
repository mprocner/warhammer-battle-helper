import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import OpenWithIcon from '@mui/icons-material/OpenWith';
import MouseIcon from '@mui/icons-material/Mouse';
import { useTranslation } from 'react-i18next';

const OPTIONS = [
  { value: 'modern', icon: OpenWithIcon, labelKey: 'settings.controlSchemeModern', descKey: 'settings.controlSchemeModernDesc' },
  { value: 'classic', icon: MouseIcon, labelKey: 'settings.controlSchemeClassic', descKey: 'settings.controlSchemeClassicDesc' },
];

const ControlSchemeSelector = ({ value, onChange }) => {
  const { t } = useTranslation();
  const [tooltip, setTooltip] = useState(null);
  const tooltipTimeout = useRef(null);

  const showTooltip = useCallback((text, el) => {
    clearTimeout(tooltipTimeout.current);
    tooltipTimeout.current = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      setTooltip({ text, top: rect.top + rect.height / 2, left: rect.left });
    }, 300);
  }, []);

  const hideTooltip = useCallback(() => {
    clearTimeout(tooltipTimeout.current);
    setTooltip(null);
  }, []);

  return (
    <div className="control-scheme-selector">
      {OPTIONS.map(({ value: optVal, icon: Icon, labelKey, descKey }) => (
        <button
          key={optVal}
          className={`control-scheme-selector__option${value === optVal ? ' control-scheme-selector__option--active' : ''}`}
          onClick={() => onChange(optVal)}
          onMouseEnter={e => showTooltip(t(descKey), e.currentTarget)}
          onMouseLeave={hideTooltip}
        >
          <Icon style={{ fontSize: 18 }} />
          <span>{t(labelKey)}</span>
        </button>
      ))}

      {tooltip && createPortal(
        <div
          className="portal-tooltip"
          style={{ top: tooltip.top, left: tooltip.left }}
        >
          <span className="portal-tooltip__arrow" />
          {tooltip.text}
        </div>,
        document.body
      )}
    </div>
  );
};

export default ControlSchemeSelector;
