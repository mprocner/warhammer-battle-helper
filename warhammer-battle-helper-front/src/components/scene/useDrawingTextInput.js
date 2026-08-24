import { useCallback, useRef, useState } from 'react';

/**
 * Owns the in-progress text label of the drawing `text` tool: where it sits and what the
 * user has typed so far. The rule it enforces is FEATURE-121 — anything typed reaches the
 * map, and only Escape throws it away.
 *
 * Why this can't live on the input's onBlur alone: DrawingLayer.handleMouseDown calls
 * e.preventDefault(), which suppresses the focus change, so clicking the canvas never
 * blurs the input and onBlur never fires. placeAt therefore commits by itself.
 */
export function useDrawingTextInput({ onCommit }) {
  // State drives the rendered input; the refs mirror it so the callbacks below read the
  // live values instead of whatever the render that created them closed over.
  const [pos, setPos] = useState(null);
  const [value, setValueState] = useState('');
  const posRef = useRef(null);
  const valueRef = useRef('');

  const close = useCallback(() => {
    posRef.current = null;
    valueRef.current = '';
    setPos(null);
    setValueState('');
  }, []);

  // Plain values only: a functional updater would land in the ref as a function.
  const setValue = useCallback((next) => {
    valueRef.current = next;
    setValueState(next);
  }, []);

  const commit = useCallback(() => {
    const coords = posRef.current;
    const text = valueRef.current.trim();
    // Close first: a blur that arrives after the input is gone then finds pos === null and
    // cannot save the same label a second time.
    close();
    if (coords && text) onCommit({ coords, text });
  }, [close, onCommit]);

  const placeAt = useCallback((coords) => {
    // An open field wins over placing a new one. Clicking elsewhere on the map saves what
    // is there and closes; the next click opens a fresh field. Reopening here instead would
    // start a chain the user can only break by switching tools.
    if (posRef.current) {
      commit();
      return;
    }
    posRef.current = coords;
    valueRef.current = '';
    setPos(coords);
    setValueState('');
  }, [commit]);

  return { pos, value, setValue, placeAt, commit, cancel: close };
}
