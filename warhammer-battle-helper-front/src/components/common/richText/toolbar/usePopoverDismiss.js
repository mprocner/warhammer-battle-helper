import { useEffect } from 'react';

// Closes a popover on mousedown outside `ref` or on Escape. `ref` must wrap the trigger too:
// otherwise clicking the trigger of an open popover closes it on mousedown and reopens it
// on click. Bubble phase on purpose — a capture listener on document would run before every
// React handler in the app.
export default function usePopoverDismiss(ref, isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [ref, isOpen, onClose]);
}
