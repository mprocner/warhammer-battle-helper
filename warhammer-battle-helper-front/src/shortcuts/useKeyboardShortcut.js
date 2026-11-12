import { useEffect, useRef } from 'react';
import { shortcut, matches, isTypingTarget, isDialogOpen } from './registry';

// Binds one registry shortcut to a handler on window keydown. Ignores keys typed into fields and
// keys pressed while a modal dialog is open, and only claims (preventDefault) a key it handled.
// The handler is read through a ref, so callers can pass an inline function without the
// listener being re-attached on every render.
export default function useKeyboardShortcut(id, handler, { enabled = true } = {}) {
  const entry = shortcut(id);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (e) => {
      if (isTypingTarget(e.target) || isDialogOpen() || !matches(entry, e)) return;
      e.preventDefault();
      handlerRef.current(e);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [entry, enabled]);
}
