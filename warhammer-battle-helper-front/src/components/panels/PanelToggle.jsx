import React from 'react';
import './PanelToggle.css';

/**
 * Reusable toggle button for showing/hiding panels
 */
const PanelToggle = ({ position, isHidden, onClick }) => {
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
      title={isHidden ? 'Show Panel' : 'Hide Panel'}
    >
      <span className="panel-toggle__arrow">{getArrow()}</span>
    </button>
  );
};

export default PanelToggle;
