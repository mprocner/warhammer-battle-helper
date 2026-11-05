import React from 'react';
import TourButton from '../tutorial/TourButton';

// Shared header of every right-panel tab: title on the left, tab actions + tour button on the right.
function TabHeader({ title, tourId, className, children }) {
  return (
    <div className={className ? `tab-header ${className}` : 'tab-header'}>
      <h3 className="tab-header__title">{title}</h3>
      {(children || tourId) && (
        <div className="tab-header__actions">
          {children}
          {tourId && <TourButton tourId={tourId} />}
        </div>
      )}
    </div>
  );
}

export default TabHeader;
