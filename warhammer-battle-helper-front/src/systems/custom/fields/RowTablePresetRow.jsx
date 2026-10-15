import React from 'react';
import LockIcon from '@mui/icons-material/Lock';
import { AFFORDANCE_ICON_SIZE } from './affordances';
import { gridColumns, detailColumns, nameColumnKey } from '../rowTableLayout';
import { StaticCell } from './RowTableCell';
import { RowExpander, RowDetails, rowHasDetails } from './RowTableDetails';

// One GM-owned row: rendered straight from the template so a GM edit reaches every player, and
// never copied into the character's stats.
//
// Its cells are muted rather than tinted. The row's background belongs to the zebra striping, and
// with borderless inputs a static cell and an editable one are otherwise identical — a player
// would discover this row is read-only by clicking it and having nothing happen. Italics were not
// available: in a skill tree they already mean "this node is mine, not the GM's".
//
// Separate from RowTablePlayerRow rather than one component with a flag: a GM row has no edit
// mode to be in, no pencil and no delete.
function RowTablePresetRow({
  preset, columns, skillOptions, gridTemplate, leading, trailing, expanded, onToggleExpand, labels,
  showTooltip, hideTooltip,
}) {
  const details = detailColumns(columns);
  const nameKey = nameColumnKey(columns);
  const ctx = { isPreset: true, editing: false };

  return (
    <div className="custom-sheet__row-table-row custom-sheet__row-table-row--preset" style={{ gridTemplateColumns: gridTemplate }}>
      {details.length > 0 && (
        <RowExpander show={rowHasDetails(details, preset)} expanded={expanded} onToggle={onToggleExpand} />
      )}
      {leading.map(s => <React.Fragment key={s.key}>{s.render(preset, ctx)}</React.Fragment>)}

      {gridColumns(columns).map(c => (
        <StaticCell
          key={c.key}
          column={c}
          value={(preset.cells && preset.cells[c.key]) || ''}
          skillOptions={skillOptions}
          isName={c.key === nameKey}
          showTooltip={showTooltip}
          hideTooltip={hideTooltip}
        />
      ))}

      {trailing.map(s => <React.Fragment key={s.key}>{s.render(preset, ctx)}</React.Fragment>)}

      <div className="custom-sheet__row-table-actions">
        <span className="custom-sheet__row-table-lock" title={labels.locked}>
          <LockIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
        </span>
      </div>

      {details.length > 0 && expanded && <RowDetails columns={details} row={preset} editing={false} />}
    </div>
  );
}

export default RowTablePresetRow;
