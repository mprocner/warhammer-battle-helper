import React from 'react';
import './PointerPing.css';

const PointerPing = ({ x, y, onComplete }) => {
  return (
    <div
      className="pointer-ping"
      style={{ left: x, top: y }}
      onAnimationEnd={onComplete}
    />
  );
};

export default PointerPing;
