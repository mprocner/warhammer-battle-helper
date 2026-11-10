import React from 'react';
import './PointerPing.css';

const PointerPing = ({ x, y, color, onComplete }) => {
  return (
    <div
      className="pointer-ping"
      style={{ left: x, top: y, '--ping-color': color }}
      onAnimationEnd={onComplete}
    />
  );
};

export default PointerPing;
