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
  // Movement-threshold guard (same shape as the hosts' drag `movedRef`): a rotate-handle press that
  // never actually moved the pointer must not snap/commit an angle. Without this, snapAngle's
  // magnetism can jump an untouched angle to the nearest 45° on a plain click (0 == 0 delta still
  // gets fed through snapAngle).
  const movedRef = useRef(false);
  // Consume-once "a handle press just finished" signal. handleRotateStart calls e.stopPropagation()
  // on mousedown, so neither host's own handleMouseDown runs and neither movedRef nor groupPressRef
  // gets set there — the browser then dispatches a native click on mouseup believing no drag
  // happened, and the host's handleClick would toggle selection right after the rotate. Both hosts
  // consume this once to swallow exactly that click.
  const justFinishedRef = useRef(false);
  const clearTimerRef = useRef(null);

  // The native click lands on the nearest common ancestor of the mousedown and mouseup targets. A
  // rotation sweeps an arc, so the pointer usually leaves the token before release — the click then
  // fires on an ancestor, the host's handleClick never runs, and an armed flag would sit there and
  // eat the user's NEXT genuine click on the token. Clearing on the following macrotask bounds the
  // signal's life to the click it was meant for: click dispatch is synchronous after mouseup, so a
  // click that does reach the host still sees the flag.
  const armJustFinished = useCallback(() => {
    justFinishedRef.current = true;
    clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => { justFinishedRef.current = false; }, 0);
  }, []);

  useEffect(() => () => clearTimeout(clearTimerRef.current), []);

  const consumeJustFinished = useCallback(() => {
    if (!justFinishedRef.current) return false;
    justFinishedRef.current = false;
    return true;
  }, []);

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
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
    movedRef.current = false;
    setIsRotating(true);
  }, [enabled, containerRef, rotation]);

  useEffect(() => {
    if (!isRotating) return;

    const compute = (e) => {
      const { centerX, centerY, startAngle, startRotation } = startRef.current;
      return snapAngle(startRotation + (angleFrom(centerX, centerY, e) - startAngle));
    };

    const onMove = (e) => {
      const { startClientX, startClientY } = startRef.current;
      if (Math.abs(e.clientX - startClientX) + Math.abs(e.clientY - startClientY) > 3) movedRef.current = true;
      setRotation(compute(e));
    };
    const onUp = (e) => {
      // Movement can also be detected on this final event alone (e.g. a synthetic mouseup fired
      // without an intervening mousemove) — check both the accumulated flag and the up-event delta.
      const { startClientX, startClientY } = startRef.current;
      const moved = movedRef.current || Math.abs(e.clientX - startClientX) + Math.abs(e.clientY - startClientY) > 3;
      if (moved) {
        const final = compute(e);
        setRotation(final);
        onCommit?.(final);
      }
      // Armed whether or not the pointer moved: a press that started on the rotate handle is never
      // a click on the token, so it must not reach select/deselect logic either way.
      armJustFinished();
      setIsRotating(false);
      startRef.current = null;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isRotating, setRotation, onCommit, armJustFinished]);

  return { isRotating, handleRotateStart, consumeJustFinished };
}
