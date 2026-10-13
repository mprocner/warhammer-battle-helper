// Band layout of an attr_table (PLAYRPG-235). Attributes are columns; when they do not fit the
// width, the table breaks into bands, and every band repeats the row-label column (Base /
// Advances / Total). CSS auto-fill can wrap the columns but cannot repeat that label column,
// so the split is computed here from the measured width.
//
// This is the table's INTERNAL layout. It does not contradict fieldRowSpan.js ("the sheet does
// no layout measurement"): that rule is about quantising field heights in the section grid, and
// an attr_table opts out of it with a content-height span of null.
export const ATTR_TABLE_LABEL_COL_PX = 64;
export const ATTR_TABLE_MIN_COL_PX = 48;

export function attrsPerBand(width) {
  if (!width) return Infinity;
  return Math.max(1, Math.floor((width - ATTR_TABLE_LABEL_COL_PX) / ATTR_TABLE_MIN_COL_PX));
}

export function splitBands(rows, perBand) {
  if (!Number.isFinite(perBand)) return rows.length ? [rows] : [];
  const out = [];
  for (let i = 0; i < rows.length; i += perBand) out.push(rows.slice(i, i + perBand));
  return out;
}
