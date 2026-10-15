import React from 'react';
import { LONG_TEXT, columnOptions, cellLabel } from '../rowTableLayout';

// One cell of a GM-columned table, in its two forms. Before PLAYRPG-269 this switch on the column
// type was written out three times — the player's row, the GM's row and the creator's preset
// editor — and every fix had to find all three.

// StaticCell is a cell at rest: text, never an input. The tooltip appears only when the text is
// actually clipped; a tooltip repeating fully visible text is noise.
export function StaticCell({ column, value, skillOptions, isName, showTooltip, hideTooltip }) {
  const label = cellLabel(column, value, skillOptions) || '—';
  return (
    <span
      className={`custom-sheet__row-table-cell-static${isName ? ' custom-sheet__row-table-cell-static--name' : ''}`}
      onMouseEnter={e => {
        const el = e.currentTarget;
        if (el.scrollWidth > el.clientWidth) showTooltip(label, el);
      }}
      onMouseLeave={hideTooltip}
    >
      {label}
    </span>
  );
}

// CellInput is the editing control for one column. `classes` is the caller's skin: the sheet's
// borderless in-row inputs and the creator's boxed preset fields share the behaviour, not the look.
// onKeyDown is not passed to the textarea — Enter there is a newline, not "done".
export function CellInput({ column, value, skillOptions = [], onChange, classes, autoFocus = false, onKeyDown }) {
  const handle = onChange ? e => onChange(e.target.value) : undefined;

  if (column.type === 'select') {
    return (
      <select className={classes.select} value={value} onChange={handle} autoFocus={autoFocus} onKeyDown={onKeyDown}>
        <option value="">—</option>
        {columnOptions(column, skillOptions).map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    );
  }
  if (column.type === LONG_TEXT) {
    return <textarea className={classes.textarea} value={value} onChange={handle} autoFocus={autoFocus} rows={3} />;
  }
  return (
    <input
      type={column.type === 'number' ? 'number' : 'text'}
      className={classes.input}
      value={value}
      onChange={handle}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
    />
  );
}
