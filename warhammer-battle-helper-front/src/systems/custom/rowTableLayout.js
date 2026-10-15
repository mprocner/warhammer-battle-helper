// Geometry and labels shared by every table whose columns the GM defines and whose rows the player
// adds: weapons_table and data_table. Weapon-only concerns (damage, the skill column's roll role,
// row completeness) stay in weaponLayout.js; this module knows nothing about rolls.

export const LONG_TEXT = 'long_text';

const EXPANDER_TRACK = '22px';
const ACTIONS_TRACK  = '52px';

// gridColumns are the columns that get a track in the row's grid. long_text is a paragraph — it
// cannot live in a fixed-width track — so it renders in the row's details panel instead.
export function gridColumns(columns) {
  return (columns || []).filter(c => c.type !== LONG_TEXT);
}

export function detailColumns(columns) {
  return (columns || []).filter(c => c.type === LONG_TEXT);
}

// The name column is the first text column: the one rowLabel names a row by and the one that gets
// the widest track.
export function nameColumnKey(columns) {
  return ((columns || []).find(c => c.type === 'text') || {}).key;
}

// rowGridTemplate builds ONE grid-template-columns string for a table. The header and every row of
// the field must be handed the same string; the columns are the GM's, so nothing else could keep
// them aligned (FEATURE-224).
//
// A column's track comes from its TYPE, never from its content. auto and max-content would make
// the width depend on the data, so a column would grow while the player types into it and shove
// its neighbours sideways under the cursor.
//
// minmax(0, …) on every flexible track: without the zero floor a track refuses to shrink below
// its content, which is the very behaviour this function exists to avoid.
//
// leading/trailing are the tracks of the caller's own slots (the weapons table's star before the
// columns, its damage and die after them). The expander track is not a slot: the core owns the
// details panel, so it reserves the expander itself whenever any column is long_text — on every
// row, filled or not, so the columns never shift between rows.
export function rowGridTemplate(columns, { leading = [], trailing = [] } = {}) {
  const nameKey = nameColumnKey(columns);

  const trackFor = (c) => {
    if (c.type === 'number') return '56px';
    if (c.type === 'select') return 'minmax(0, 140px)';
    return c.key === nameKey ? 'minmax(0, 2fr)' : 'minmax(0, 1fr)';
  };

  return [
    detailColumns(columns).length > 0 && EXPANDER_TRACK,
    ...leading,
    ...gridColumns(columns).map(trackFor),
    ...trailing,
    ACTIONS_TRACK,
  ].filter(Boolean).join(' ');
}

// rowLabel picks a display name for a row: the first non-empty text column, then any non-empty
// grid cell, then the fallback. long_text is skipped — a paragraph is not a name, and this label
// lands in catalog dropdowns and roll logs.
export function rowLabel(columns, row, fallback) {
  const cells = row.cells || {};
  const filled = c => (cells[c.key] || '').trim();
  const cols = gridColumns(columns);
  const text = cols.find(c => c.type === 'text' && filled(c));
  if (text) return filled(text);
  const any = cols.find(filled);
  if (any) return filled(any);
  return fallback;
}

// columnOptions lists what a select column offers: the character's skills for a weapons skill
// column, the GM's manual list otherwise (a manual option's stored value IS its label).
export function columnOptions(column, skillOptions = []) {
  return column.optionsFromSkills
    ? skillOptions
    : (column.options || []).map(o => ({ key: o, label: o }));
}

// cellLabel resolves a cell to its display text. A select key that no longer resolves — a removed
// skill, a deleted custom node — returns '' rather than the raw surrogate key: those ids are
// internal and must never reach the screen, so callers' own `|| '—'` is what the player sees.
export function cellLabel(column, value, skillOptions = []) {
  if (column.type !== 'select') return value;
  return columnOptions(column, skillOptions).find(o => o.key === value)?.label || '';
}

// sortColumnKey names the column a sorted table orders by: the GM's pick while it is still a short
// text column, otherwise the name column — never a number or a paragraph. null when sorting is off
// or the table has no short text column to sort by.
export function sortColumnKey(field) {
  if (!field.sortAlphabetically) return null;
  const columns = field.columns || [];
  const picked = columns.find(c => c.key === field.sortColumn && c.type === 'text');
  return picked ? picked.key : (nameColumnKey(columns) || null);
}

// sortByText orders items by the text textOf gives each: case-insensitively, with digits compared
// as numbers ("item 9" before "item 10"). An empty value has nothing to be ordered by, so it goes
// last; equal values keep their original order.
export function sortByText(items, textOf) {
  return items
    .map((item, index) => ({ item, index, text: (textOf(item) || '').trim() }))
    .sort((a, b) => (!a.text - !b.text)
      || a.text.localeCompare(b.text, undefined, { numeric: true, sensitivity: 'base' })
      || a.index - b.index)
    .map(entry => entry.item);
}
