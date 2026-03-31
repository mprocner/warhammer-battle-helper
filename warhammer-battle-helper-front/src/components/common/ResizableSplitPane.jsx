import React, { useCallback, useEffect, useRef, useState } from 'react';

const ResizableSplitPane = ({ top, bottom }) => {
  const [splitPercent, setSplitPercent] = useState(50);
  const [isSplitDragging, setIsSplitDragging] = useState(false);
  const containerRef = useRef(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (isSplitDragging) {
      document.body.style.cursor = 'ns-resize';
    } else {
      document.body.style.cursor = '';
    }
    return () => { document.body.style.cursor = ''; };
  }, [isSplitDragging]);

  const handleResizerMouseDown = useCallback((e) => {
    e.preventDefault();
    draggingRef.current = true;
    setIsSplitDragging(true);

    const onMouseMove = (e) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const percent = (relativeY / rect.height) * 100;
      setSplitPercent(Math.min(85, Math.max(15, percent)));
    };

    const onMouseUp = () => {
      draggingRef.current = false;
      setIsSplitDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <div
      className="sidebar-resizable-container"
      ref={containerRef}
      style={{ userSelect: isSplitDragging ? 'none' : 'auto' }}
    >
      <div className="sidebar-top-section" style={{ height: `${splitPercent}%` }}>
        {top}
      </div>
      <div
        className={`sidebar-resizer${isSplitDragging ? ' sidebar-resizer--dragging' : ''}`}
        onMouseDown={handleResizerMouseDown}
      />
      <div className="sidebar-bottom-section">
        {bottom}
      </div>
    </div>
  );
};

export default ResizableSplitPane;
