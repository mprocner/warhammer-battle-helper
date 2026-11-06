import React from 'react';
import { useTranslation } from 'react-i18next';
import './PanelToggle.css';

/**
 * Reusable toggle button for showing/hiding panels
 */
const PanelToggle = ({ position, isHidden, onClick }) => {
  const { t } = useTranslation();
  // Determine arrow direction based on position and hidden state
  const getArrow = () => {
    if (position === 'left') {
      return isHidden ? '▶' : '◀';
    } else {
      return isHidden ? '◀' : '▶';
    }
  };

  return (
    <button
      className={`panel-toggle panel-toggle--${position} ${isHidden ? 'panel-toggle--hidden' : ''}`}
      onClick={onClick}
      title={isHidden ? t('leftPanel.showPanel') : t('leftPanel.hidePanel')}
    >
      <span className="panel-toggle__arrow">{getArrow()}</span>
    </button>
  );
};

export default PanelToggle;
