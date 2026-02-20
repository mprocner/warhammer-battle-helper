import React from 'react';
import HandoutTypeIcon from './HandoutTypeIcon';
import './HandoutItem.css';

/**
 * Static (no dnd-kit hooks) ghost version of HandoutItem shown during
 * cross-container drag to preview where the handout will land.
 */
const HandoutItemPhantom = ({ handout, isGM }) => (
  <div className="handout-item handout-item--phantom">
    {isGM && (
      <div className="handout-item__drag-handle">
        <span className="drag-icon">⋮⋮</span>
      </div>
    )}
    <div className="handout-item__content">
      <div className="handout-item__icon">
        <HandoutTypeIcon type={handout.type} />
      </div>
      <div className="handout-item__info">
        <h4 className="handout-item__title">
          <span className="handout-item__truncate">{handout.title}</span>
        </h4>
      </div>
    </div>
  </div>
);

export default HandoutItemPhantom;
