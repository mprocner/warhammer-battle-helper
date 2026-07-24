import React from 'react';

// Visual marquee rectangle drawn in scene-content pixel space (already inside the zoom transform).
const MarqueeOverlay = ({ rect }) => {
  if (!rect) return null;
  return (
    <div
      className="marquee-overlay"
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: 40,
        pointerEvents: 'none',
      }}
    />
  );
};

export default MarqueeOverlay;
