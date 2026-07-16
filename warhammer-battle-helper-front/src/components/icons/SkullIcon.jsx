import React from 'react';

// Skull glyph. Lives here (not in the MUI-based tokenIcons catalog) because
// @mui/icons-material has no skull — see components/icons/README for the convention.
// fill="currentColor" so callers control the color via CSS `color`.
export default function SkullIcon({ size = 16, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" {...rest}>
      <path d="M12 2C7.6 2 4 5.6 4 10c0 2.4 1.1 4.5 2.8 6v2.5c0 .8.7 1.5 1.5 1.5H10v-1.5c0-.3.2-.5.5-.5s.5.2.5.5V20h2v-1.5c0-.3.2-.5.5-.5s.5.2.5.5V20h1.7c.8 0 1.5-.7 1.5-1.5V16c1.7-1.5 2.8-3.6 2.8-6 0-4.4-3.6-8-8-8zM8.5 12c-.8 0-1.5-.7-1.5-1.5S7.7 9 8.5 9s1.5.7 1.5 1.5S9.3 12 8.5 12zm3.5 2l-1-2h2l-1 2zm3.5-2c-.8 0-1.5-.7-1.5-1.5S14.7 9 15.5 9s1.5.7 1.5 1.5S16.3 12 15.5 12z" />
    </svg>
  );
}
