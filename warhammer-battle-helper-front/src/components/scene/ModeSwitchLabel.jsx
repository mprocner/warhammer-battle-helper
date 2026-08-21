import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './ModeSwitchLabel.css';

// Floating mode name shown at the cursor after a middle-click mode switch.
// Portalled to document.body with position:fixed on purpose — it must keep a
// constant on-screen size, and anything rendered inside .scene-viewport__content
// sits under transform:scale(zoom), which would shrink the text at low zoom and
// blow it up at high zoom (that is why PointerPing is sized in map units).
// Removal is driven by onAnimationEnd, same pattern as PointerPing.
const ModeSwitchLabel = ({ x, y, labelKey, onDone }) => {
  const { t } = useTranslation();

  return createPortal(
    <div
      className="mode-switch-label"
      style={{ left: x, top: y }}
      onAnimationEnd={onDone}
    >
      {t(labelKey)}
    </div>,
    document.body
  );
};

export default ModeSwitchLabel;
