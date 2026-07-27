import { useState, useRef, useEffect, useCallback } from 'react';
import { snapAngle } from '../../utils/angleSnap';

// Shared rotation drag for BOTH token kinds. Unlike resize, this math is unit-agnostic: the pivot
// is read from the DOM in screen pixels via getBoundingClientRect and the result is degrees, so it
// never touches character cells or image pixels. That is why rotation shares a hook and resize
// does not.
//
// The caller owns the angle (rotation/setRotation) so it can reconcile with server state; the hook
// only drives it during a drag and reports the final value once, on mouseup.
export function useTokenRotate({ containerRef, rotation, setRotation, enabled = true, onCommit }) {
  const [isRotating, setIsRotating] = useState(false);
  const startRef = useRef(null);

  const angleFrom = (centerX, centerY, e) =>
    Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

  const handleRotateStart = useCallback((e) => {
    if (!enabled || e.button !== 0 || !containerRef.current) return;
    e.preventDefault();
    e.stopPropagation(); // never let the host start a drag, or the viewport start a marquee
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    startRef.current = {
      centerX,
      centerY,
      startAngle: angleFrom(centerX, centerY, e),
      startRotation: rotation,
    };
    setIsRotating(true);
  }, [enabled, containerRef, rotation]);

  useEffect(() => {
    if (!isRotating) return;

    const compute = (e) => {
      const { centerX, centerY, startAngle, startRotation } = startRef.current;
      return snapAngle(startRotation + (angleFrom(centerX, centerY, e) - startAngle));
    };

    const onMove = (e) => setRotation(compute(e));
    const onUp = (e) => {
      const final = compute(e);
      setRotation(final);
      setIsRotating(false);
      startRef.current = null;
      onCommit?.(final);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isRotating, setRotation, onCommit]);

  return { isRotating, handleRotateStart };
}
