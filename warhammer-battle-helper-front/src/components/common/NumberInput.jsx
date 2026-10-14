import React, { useState } from 'react';

// Drop-in for <input type="number"> whose parent coerces the value with `Number(v) || 0`.
// Without it, clearing the field to retype it commits 0 on the spot, the controlled input
// re-renders "0", and the next keystroke lands after it: clearing 5 to type 7 gives "07".
// The draft holds the raw text only while it is unparseable (empty, a lone "-"); parseable
// keystrokes still reach onChange live, so autosave and derived totals behave as before.
// Blur hands a leftover unparseable value to onChange once, so the parent's own fallback
// (0, 1, 10 — whatever that field uses) decides what an empty field means.
export default function NumberInput({ value, onChange, onBlur, ...rest }) {
  const [draft, setDraft] = useState(null);

  const handleChange = e => {
    const raw = e.target.value;
    if (Number.isNaN(parseFloat(raw))) {
      setDraft(raw);
      return;
    }
    setDraft(null);
    onChange?.(e);
  };

  const handleBlur = e => {
    if (draft !== null) {
      setDraft(null);
      onChange?.(e);
    }
    onBlur?.(e);
  };

  return (
    <input
      {...rest}
      type="number"
      value={draft ?? value}
      onChange={onChange ? handleChange : undefined}
      onBlur={handleBlur}
    />
  );
}
