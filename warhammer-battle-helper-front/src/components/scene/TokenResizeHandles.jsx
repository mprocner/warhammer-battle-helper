import React from 'react';

// Shared 8-handle resize chrome used by BOTH token kinds (character + image) so the look and
// behaviour stay identical. The per-kind resize math lives in each host component; this only
// renders the handles and reports which one is grabbed.
const HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

export default function TokenResizeHandles({ onResizeStart }) {
  return (
    <>
      {HANDLES.map(h => (
        <div
          key={h}
          className={`token-resize-handle token-resize-handle--${h}`}
          onMouseDown={(e) => onResizeStart(e, h)}
        />
      ))}
    </>
  );
}
