import React from 'react';
import './TabPlaceholder.css';

/**
 * Handouts tab - placeholder component
 */
const HandoutsTab = () => {
  return (
    <div className="tab-placeholder">
      <div className="tab-placeholder__icon">📜</div>
      <h3 className="tab-placeholder__title">Handouts</h3>
      <p className="tab-placeholder__message">Coming soon...</p>
      <p className="tab-placeholder__description">
        Share images, notes, and documents with your party.
      </p>
    </div>
  );
};

export default HandoutsTab;
