import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import { useTokenRotate } from './useTokenRotate';
import { normalizeRotation, rotateHandlePoint } from './drawingText';

// Rotate handle of the selected drawing label. It sits past the end of the first line, along the
// text, and turns the label around its anchor (points[0]) — the same pivot the canvas rotates
// around. The angle drives the canvas live through onPreview; onCommit fires once, on release.
//
// contentRef is the scene content box: scene px (0, 0) is its top-left corner and it is only
// scaled (zoom), never rotated, so its rect converts the anchor to client px.
export default function DrawingTextRotateHandle({ path, contentRef, onPreview, onCommit }) {
  const { t } = useTranslation();
  const stored = path.rotation || 0;
  const [rotation, setRotationState] = useState(stored);

  // A server update (another client, the toolbar slider) moves the handle too.
  useEffect(() => { setRotationState(stored); }, [stored]);

  const setRotation = useCallback((deg) => {
    setRotationState(deg);
    onPreview({ id: path.id, rotation: normalizeRotation(deg) });
  }, [onPreview, path.id]);

  const getPivot = useCallback(() => {
    const el = contentRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const scale = el.offsetWidth ? rect.width / el.offsetWidth : 1;
    const [ax, ay] = path.points[0];
    return { x: rect.left + ax * scale, y: rect.top + ay * scale };
  }, [contentRef, path.points]);

  const handleCommit = useCallback((deg) => onCommit(path.id, normalizeRotation(deg)), [onCommit, path.id]);

  const { isRotating, handleRotateStart } = useTokenRotate({
    getPivot, rotation, setRotation, onCommit: handleCommit,
  });

  // The drag is over (committed or not): stop overriding the stored angle.
  useEffect(() => { if (!isRotating) onPreview(null); }, [isRotating, onPreview]);

  const [x, y] = rotateHandlePoint({ ...path, rotation });
  return (
    <div
      className="drawing-text-rotate"
      style={{ left: x, top: y }}
      onMouseDown={handleRotateStart}
      title={t('scenes.textRotate')}
    >
      <RotateRightIcon style={{ fontSize: 14 }} />
    </div>
  );
}
