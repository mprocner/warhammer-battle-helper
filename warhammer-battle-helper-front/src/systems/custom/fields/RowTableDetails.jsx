import React from 'react';
import { useTranslation } from 'react-i18next';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { AFFORDANCE_ICON_SIZE } from './affordances';
import { CellInput } from './RowTableCell';

// A row's long_text cells. They cannot live in a fixed-width grid track, so they open in a panel
// under the row, across its full width.

export function rowHasDetails(columns, row) {
  const cells = row.cells || {};
  return columns.some(c => (cells[c.key] || '').trim());
}

// The expander keeps its track even when hidden (an empty span), so the columns of a row with no
// description line up with those of a row that has one.
export function RowExpander({ show, expanded, onToggle }) {
  const { t } = useTranslation();
  if (!show) return <span className="custom-sheet__row-table-expander" aria-hidden="true" />;
  const Icon = expanded ? ExpandMoreIcon : ChevronRightIcon;
  return (
    <button
      className="custom-sheet__row-table-expander"
      onClick={onToggle}
      title={t(expanded ? 'customSheet.collapseRow' : 'customSheet.expandRow')}
      aria-expanded={expanded}
    >
      <Icon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
    </button>
  );
}

// The panel is a child of the row element (grid-column: 1 / -1 in CSS), never a sibling: the
// zebra striping counts sibling parity, and a sibling panel would flip the tint of every row after
// an expanded one.
export function RowDetails({ columns, row, editing, onCell }) {
  const cells = row.cells || {};
  return (
    <div className="custom-sheet__row-table-details">
      {columns.map(c => (
        <div key={c.key}>
          <span className="custom-sheet__row-table-detail-label">{c.label}</span>
          {editing ? (
            <CellInput
              column={c}
              value={cells[c.key] || ''}
              onChange={onCell ? v => onCell(c.key, v) : undefined}
              classes={{ textarea: 'custom-sheet__row-table-detail-input' }}
            />
          ) : (
            <div className="custom-sheet__row-table-detail-text">{cells[c.key] || '—'}</div>
          )}
        </div>
      ))}
    </div>
  );
}
