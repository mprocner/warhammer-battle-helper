import React from 'react';
import './TabPlaceholder.css';

/**
 * Scenes tab - placeholder component
 */
const ScenesTab = () => {
  return (
    <div className="tab-placeholder">
      <div className="tab-placeholder__icon">🗺️</div>
      <h3 className="tab-placeholder__title">Scenes</h3>
      <p className="tab-placeholder__message">Coming soon...</p>
      <p className="tab-placeholder__description">
        Manage battle maps, scene layers, and terrain elements.
      </p>
    </div>
  );
};

export default ScenesTab;
