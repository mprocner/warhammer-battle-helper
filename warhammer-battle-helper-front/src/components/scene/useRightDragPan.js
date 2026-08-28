import { useRef, useEffect, useCallback } from 'react';

// px of movement before a right-press counts as a pan rather than a menu click. Higher than the 5px
// the pre-FEATURE-142 code used: a right-click closes a fog polygon and abandons a drawing stroke,
// so a shaky hand must not silently pan the map instead of triggering the tool action.
const RIGHT_PAN_THRESHOLD = 8;

/**
 * Right-button drag-to-pan for the scene map, on every layer and in both control schemes.
 *
 * Pointer Events, not mouse events: Chrome on macOS never fires `mouseup` for the secondary button,
 * only `pointerup`.
 *
 * The hard part is not the panning, it is telling a pan from a right-click without breaking the
 * context menu — the browser fires `contextmenu` at a different point in the gesture on each OS
 * (macOS on pointerdown, Windows after pointerup). So we never let the native event decide anything:
 * every trusted right-button `contextmenu` is suppressed, and on release we *replay* a synthetic one
 * when the press turned out to be a click. Menu opening is then driven purely by `pointerup`, whose
 * ordering is identical everywhere.
 *
 * The suppression predicate reads only the event's own properties — no flag written by a different
 * event, no timer — so there is nothing for the OS's event ordering to race against. That is the
 * bug that sank the previous implementation (548d6ca / 3267a75); see the FEATURE-142 design doc.
 *
 * `button === 2` is what separates a physical right press from macOS's Ctrl+click emulation and the
 * Menu key, which both report button 0 with no matching pointerdown. Those keep the native menu.
 */
export function useRightDragPan({ viewportRef, panOffsetRef, schemeRef, setPanOffset, setIsPanning }) {
  // Drag origin: pointer position plus both scroll models' starting values, so a move can be
  // resolved against whichever scheme is active without re-reading the DOM.
  const startRef = useRef(null);
  const didPanRef = useRef(false);

  const onPointerDownCapture = useCallback((e) => {
    // The viewport contains a real text input (the drawing text tool): its own context menu
    // (paste, spellcheck) and native drag-select must keep working, not be hijacked into a pan.
    if (e.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
    if (e.button !== 2) return;
    startRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: panOffsetRef.current.x,
      startY: panOffsetRef.current.y,
      scrollLeft: viewportRef.current?.scrollLeft || 0,
      scrollTop: viewportRef.current?.scrollTop || 0,
    };
    didPanRef.current = false;
  }, [panOffsetRef, viewportRef]);

  const onContextMenuCapture = useCallback((e) => {
    if (e.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
    // Our own replay is untrusted and must reach SceneImage / the group menu / the fog and drawing
    // layers untouched.
    //
    // `(buttons & ~2) === 0` means the right button is the only one involved — the only case we can
    // replay. A mouse is ONE pointer: pressing the right button while another is already down fires
    // `pointermove` (buttons 1→3), never `pointerdown`, and releasing it fires `pointermove` again,
    // never `pointerup`. So no gesture gets recorded and no replay can follow; suppressing there
    // would swallow the event outright. That is what broke right-click-to-abandon mid-stroke in
    // DrawingLayer and in FogLayer's freehand/rect tools — the fog shape was saved instead of
    // discarded. Measured values: 2 for a standalone press, 0 once released (Windows ordering),
    // 3 with the left button held, 6 with the middle.
    if (e.isTrusted && e.button === 2 && (e.buttons & ~2) === 0) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  useEffect(() => {
    const handleMove = (e) => {
      const start = startRef.current;
      if (!start) return;
      const dx = e.clientX - start.mouseX;
      const dy = e.clientY - start.mouseY;
      if (!didPanRef.current) {
        if (Math.hypot(dx, dy) <= RIGHT_PAN_THRESHOLD) return;
        didPanRef.current = true;
        setIsPanning(true);
      }
      if (schemeRef.current === 'classic') {
        const el = viewportRef.current;
        if (el) {
          el.scrollLeft = start.scrollLeft - dx;
          el.scrollTop = start.scrollTop - dy;
        }
      } else {
        const offset = { x: start.startX + dx, y: start.startY + dy };
        setPanOffset(offset);
        panOffsetRef.current = offset;
      }
    };

    const end = (e, replay) => {
      if (!startRef.current) return;
      const wasDrag = didPanRef.current;
      startRef.current = null;
      didPanRef.current = false;
      if (wasDrag) setIsPanning(false);
      if (replay && !wasDrag) {
        // Synchronous — no setTimeout. The old code deferred this and raced the browser's own
        // contextmenu; there is nothing left to wait for now that suppression is unconditional.
        document.elementFromPoint(e.clientX, e.clientY)?.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true, view: window,
          clientX: e.clientX, clientY: e.clientY, button: 2,
        }));
      }
    };

    const handleUp = (e) => end(e, true);
    // A cancelled gesture (OS gesture, window focus loss) is neither a pan nor a click: clean up the
    // grabbing cursor, but do not open a menu the user never asked for.
    const handleCancel = (e) => end(e, false);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [panOffsetRef, schemeRef, setIsPanning, setPanOffset, viewportRef]);

  return { onPointerDownCapture, onContextMenuCapture };
}
