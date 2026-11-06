import React from 'react';
import { useChangelogUnseen } from './seen';

// Marks a link to /changelog while the latest release is unseen. Absolutely positioned
// on its parent's corner by default; `inline` sits it next to text instead.
const ChangelogDot = ({ inline = false }) => {
  const unseen = useChangelogUnseen();
  if (!unseen) return null;
  return <span className={`changelog-dot${inline ? ' changelog-dot--inline' : ''}`} aria-hidden="true" />;
};

export default ChangelogDot;
