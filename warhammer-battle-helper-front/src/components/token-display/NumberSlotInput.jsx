import React, { useEffect, useRef, useState } from 'react';

// Editable value for a number ring slot: shown when the token is selected and the viewer can edit.
// Typing + Enter (or blur) commits an absolute value via onCommit — much faster than the ▲/▼
// steppers for jumping to e.g. 20. Escape reverts. Used by both TokenOverlay and ImageTokenOverlay.
export default function NumberSlotInput({ value, onCommit, className = 'token-slot__input' }) {
  const [draft, setDraft] = useState(String(value ?? 0));
  const focusedRef = useRef(false);

  // Keep in sync with live (WS) updates, but never clobber what the GM is mid-typing.
  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value ?? 0));
  }, [value]);

  const commit = () => {
    const n = parseFloat(draft);
    if (!Number.isNaN(n) && n !== (value ?? 0)) onCommit(n);
    else setDraft(String(value ?? 0)); // revert empty/invalid/unchanged
  };

  return (
    <input
      type="number"
      className={className}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => { focusedRef.current = true; e.target.select(); }}
      onBlur={() => { focusedRef.current = false; commit(); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        // Enter/Escape just blur; the single commit (or revert) happens in onBlur.
        if (e.key === 'Enter') { e.currentTarget.blur(); }
        else if (e.key === 'Escape') { setDraft(String(value ?? 0)); e.currentTarget.blur(); }
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
}
