import React from 'react';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import { AFFORDANCE_ICON_SIZE } from './affordances';
import { gridColumns, detailColumns, nameColumnKey } from '../rowTableLayout';
import { StaticCell, CellInput } from './RowTableCell';
import { RowExpander, RowDetails, rowHasDetails } from './RowTableDetails';

const GRID_INPUT_CLASSES = {
  input:  'custom-sheet__row-table-cell-input',
  select: 'custom-sheet__row-table-cell-select',
};

// One player-owned row, in one of two modes.
//
// At rest it renders the same static cells a GM row does. A row is set up once and then rarely
// touched, so inputs that are always live spend most of the row's life offering nothing but a
// chance to change it by accident. The pencil guards the cells and the long-text details.
//
// Delete is not behind the pencil: it sits next to it in both modes, because removing a row is a
// deliberate act the player should not have to enter a mode for. What guards it instead is a
// confirmation (RowTable owns it) — the one action here with no undo gets the one extra click.
//
// Editing is a visibility gate, not a buffer: a keystroke still writes through onCell, and the
// tick only closes the mode. The save itself is debounced 800ms upstream in CharacterSheet's
// triggerAutoSave, so buffering here would buy nothing but an undo nobody asked for.
//
// Editing forces the details panel open — the textarea has to be visible to type into — without
// touching the remembered `expanded` state, so the tick returns the row to how it was.
function RowTablePlayerRow({
  row, columns, skillOptions, gridTemplate, leading, trailing, editing, expanded, onToggleExpand,
  onStartEdit, onFinishEdit, onCell, onRequestRemove, labels, showTooltip, hideTooltip,
}) {
  const details = detailColumns(columns);
  const nameKey = nameColumnKey(columns);
  const ctx = { editing };
  const cell = (colKey, value) => onCell && onCell(row.id, colKey, value);

  // Enter closes the edit the same way the tick does — there is no buffer to flush.
  const finishOnEnter = e => { if (e.key === 'Enter') onFinishEdit(); };

  return (
    <div
      className={`custom-sheet__row-table-row${editing ? '' : ' custom-sheet__row-table-row--reading'}`}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {details.length > 0 && (
        <RowExpander show={!editing && rowHasDetails(details, row)} expanded={expanded} onToggle={onToggleExpand} />
      )}
      {leading.map(s => <React.Fragment key={s.key}>{s.render(row, ctx)}</React.Fragment>)}

      {gridColumns(columns).map((c, i) => {
        const val = (row.cells && row.cells[c.key]) || '';
        if (!editing) {
          return (
            <StaticCell
              key={c.key}
              column={c}
              value={val}
              skillOptions={skillOptions}
              isName={c.key === nameKey}
              showTooltip={showTooltip}
              hideTooltip={hideTooltip}
            />
          );
        }
        // autoFocus only on the first cell: the pencil opens the row straight into it.
        return (
          <CellInput
            key={c.key}
            column={c}
            value={val}
            skillOptions={skillOptions}
            onChange={onCell ? v => cell(c.key, v) : undefined}
            classes={GRID_INPUT_CLASSES}
            autoFocus={i === 0}
            onKeyDown={finishOnEnter}
          />
        );
      })}

      {trailing.map(s => <React.Fragment key={s.key}>{s.render(row, ctx)}</React.Fragment>)}

      <div className="custom-sheet__row-table-actions">
        {onCell && (
          <>
            {editing ? (
              <button className="custom-sheet__row-table-save" onClick={() => onFinishEdit()} title={labels.save}>
                <CheckIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
              </button>
            ) : (
              <button className="custom-sheet__row-table-edit" onClick={() => onStartEdit(row.id)} title={labels.edit}>
                <EditIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
              </button>
            )}
            <button className="custom-sheet__row-table-remove" onClick={() => onRequestRemove(row)} title={labels.remove}>
              <DeleteIcon style={{ fontSize: AFFORDANCE_ICON_SIZE }} />
            </button>
          </>
        )}
      </div>

      {details.length > 0 && (editing || expanded) && (
        <RowDetails columns={details} row={row} editing={editing} onCell={onCell ? cell : null} />
      )}
    </div>
  );
}

export default RowTablePlayerRow;
