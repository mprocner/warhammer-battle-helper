import { useEffect, useRef } from 'react';
import { shortcut, matches, isTypingTarget, isDialogOpen } from './registry';

// Binds one registry shortcut to a handler on window keydown. Ignores keys typed into fields and
// keys pressed while a modal dialog is open, and only claims (preventDefault) a key it handled.
// `when` is checked per event, before the key is claimed: answering false leaves the key to the
// browser (Ctrl+C with no image selected, or with text selected, must still copy text).
// The handler and `when` are read through refs, so callers can pass inline functions without the
// listener being re-attached on every render.
export default function useKeyboardShortcut(id, handler, { enabled = true, when } = {}) {
  const entry = shortcut(id);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const whenRef = useRef(when);
  whenRef.current = when;

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (e) => {
      if (isTypingTarget(e.target) || isDialogOpen() || !matches(entry, e)) return;
      if (whenRef.current && !whenRef.current(e)) return;
      e.preventDefault();
      handlerRef.current(e);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [entry, enabled]);
}
