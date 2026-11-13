import { useCallback, useRef, useState } from 'react';

/**
 * Owns the open text field of the drawing `text` tool: where it sits, what the user has typed,
 * its style, and — when it edits an existing label — which one. The rule it enforces is
 * FEATURE-121 — anything typed reaches the map, and only Escape throws it away.
 *
 * Why this can't live on the field's onBlur alone: DrawingLayer.handleMouseDown calls
 * e.preventDefault(), which suppresses the focus change, so clicking the canvas never
 * blurs the field and onBlur never fires. placeAt/editPath therefore commit by themselves.
 *
 * onCommit receives { coords, text, style, editingPath }. For a new label it fires only with
 * non-empty text; for an edited label it fires with whatever is left — empty text means the
 * user cleared it, and the caller deletes it. An edit that changed nothing does not fire.
 */
export function useDrawingTextInput({ onCommit }) {
  // State drives the rendered field; the ref mirrors it so the callbacks below read the live
  // session instead of whatever the render that created them closed over.
  const [session, setSessionState] = useState(null);
  const sessionRef = useRef(null);
  // commit must keep one identity for the life of the hook: callers commit from effects keyed on
  // it (tool change), and a commit that changed with every onCommit would fire those effects —
  // closing a field the moment it opened.
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const setSession = useCallback((next) => {
    sessionRef.current = next;
    setSessionState(next);
  }, []);

  const close = useCallback(() => setSession(null), [setSession]);

  // Plain values only: a functional updater would land in the ref as a function.
  const setValue = useCallback((value) => {
    if (sessionRef.current) setSession({ ...sessionRef.current, value });
  }, [setSession]);

  const setStyle = useCallback((patch) => {
    const s = sessionRef.current;
    if (s) setSession({ ...s, style: { ...s.style, ...patch } });
  }, [setSession]);

  const commit = useCallback(() => {
    const s = sessionRef.current;
    // Close first: a blur that arrives after the field is gone then finds no session and
    // cannot save the same label a second time.
    close();
    if (!s) return;
    const text = s.value.trim();
    const { editingPath } = s;
    if (editingPath) {
      const unchanged = text === editingPath.text
        && Object.entries(s.style).every(([k, v]) => editingPath[k] === v);
      if (unchanged) return;
    } else if (!text) {
      return;
    }
    onCommitRef.current({ coords: s.pos, text, style: s.style, editingPath });
  }, [close]);

  const open = useCallback((pos, value, style, editingPath) => {
    // An open field wins over opening another. Clicking elsewhere on the map saves what is
    // there and closes; the next click opens a fresh field. Reopening here instead would
    // start a chain the user can only break by switching tools.
    if (sessionRef.current) {
      commit();
      return;
    }
    setSession({ pos, value, style, editingPath });
  }, [commit, setSession]);

  const placeAt = useCallback((coords, style = {}) => open(coords, '', style, null), [open]);

  const editPath = useCallback((path, style) => open(path.points[0], path.text, style, path), [open]);

  return {
    pos: session?.pos ?? null,
    value: session?.value ?? '',
    style: session?.style ?? null,
    editingPath: session?.editingPath ?? null,
    setValue,
    setStyle,
    placeAt,
    editPath,
    commit,
    cancel: close,
  };
}
