import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const PortalTooltip = ({ text, targetRef }) => {
  const [pos, setPos] = useState(null);
  const hideTimeout = useRef(null);

  const show = useCallback(() => {
    clearTimeout(hideTimeout.current);
    const el = targetRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top + rect.height / 2, left: rect.left });
  }, [targetRef]);

  const hide = useCallback(() => {
    hideTimeout.current = setTimeout(() => setPos(null), 100);
  }, []);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    el.addEventListener('mouseenter', show);
    el.addEventListener('mouseleave', hide);
    return () => {
      el.removeEventListener('mouseenter', show);
      el.removeEventListener('mouseleave', hide);
      clearTimeout(hideTimeout.current);
    };
  }, [targetRef, show, hide]);

  if (!pos) return null;
  return createPortal(
    <div className="music-tab__portal-tooltip" style={{ top: pos.top, left: pos.left }}>
      {text}
      <div className="music-tab__portal-tooltip-arrow" />
    </div>,
    document.body
  );
};

export default PortalTooltip;
