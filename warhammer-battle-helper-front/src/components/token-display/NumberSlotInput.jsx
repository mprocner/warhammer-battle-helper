import React, { useEffect, useRef, useState } from 'react';

// Width of one character at `800 9px Georgia`, plus room for the caret. Four characters ("-999")
// land on 22px, which is exactly the width this field used to be fixed at — so the widest chip is
// no wider than before and the resting ring keeps its clearance. Shorter values simply take less.
const CHAR_WIDTH = 4.5;
// Not CSS padding (the input's own padding is 0) — slack so the caret has somewhere to sit.
const CARET_ALLOWANCE = 4;
const MIN_CHARS = 1;
const MAX_CHARS = 4;

function widthFor(text) {
  const chars = Math.min(MAX_CHARS, Math.max(MIN_CHARS, String(text).length));
  return `${CARET_ALLOWANCE + Math.round(chars * CHAR_WIDTH)}px`;
}

// Editable value for a number ring slot: shown when the token is selected and the viewer can edit.
// Typing + Enter (or blur) commits an absolute value via onCommit — much faster than the ▲/▼
// steppers for jumping to e.g. 20. Escape reverts. Used by both TokenOverlay and ImageTokenOverlay.
// `onFocusChange` lets the ring keep the slot open while it is being typed in, even if the pointer
// has wandered off the chip.
export default function NumberSlotInput({ value, onCommit, onFocusChange, className = 'token-slot__input' }) {
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
      style={{ width: widthFor(draft) }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => { focusedRef.current = true; e.target.select(); if (onFocusChange) onFocusChange(true); }}
      onBlur={() => { focusedRef.current = false; commit(); if (onFocusChange) onFocusChange(false); }}
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
