import React from 'react';

/**
 * Returns the appropriate icon for a handout type
 */
const HandoutTypeIcon = ({ type, className = '' }) => {
  const icons = {
    image: '🖼️',
    pdf: '📄',
    text: '📝',
    map: '🗺️',
    letter: '✉️'
  };

  return (
    <span className={`handout-type-icon ${className}`} role="img" aria-label={type}>
      {icons[type] || '📜'}
    </span>
  );
};

export default HandoutTypeIcon;
