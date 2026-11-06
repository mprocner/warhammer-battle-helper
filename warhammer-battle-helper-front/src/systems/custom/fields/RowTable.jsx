import React, { useState, useRef } from 'react';
import ConfirmModal from '../../../components/common/ConfirmModal';
import { splitHalf } from '../skillLayout';
import { rowGridTemplate, rowLabel, gridColumns, detailColumns, sortByText } from '../rowTableLayout';
import RowTablePlayerRow from './RowTablePlayerRow';

// The core of every table whose columns the GM defines and whose rows the player adds: a header
// bar, the player's rows, and a footer that adds a row or copies one from the GM's catalog.
//
// What a particular table adds of its own — the weapons table's star, damage and die — comes in as
// slots: extra columns before (`leading`) or after (`trailing`) the GM's. The grid template is
// built here from the slots' tracks, so the header and every row get one string and cannot
// disagree about where a column starts.
//
// The footer is a sibling of the table container, not of the rows: the zebra striping counts
// sibling parity, so a footer inside would be counted as a row and flip the tint of everything
// after it. That is why this returns a fragment and the caller owns the field wrapper.
//
// editingPath/setEditingPath are the sheet-wide pair CustomSheetBody hands to every editable
// list: exactly one thing is edited at a time. Row ids ("w_…", "r_…") never contain a dot, and
// skill edit paths always do, so they cannot collide.
//
// onCell and onRemove travel together: a caller passes both or neither (RowTablePlayerRow gates
// the remove button on onCell). With neither, `showAffordances` (the creator's preview) renders the
// pencil, bin and footer as disabled copies so the row reads as the player will see it.
//
// Removing a row always goes through a confirmation, from either mode: there is no undo, and the
// button sits next to the pencil where a stray click can reach it. The modal names the row by
// rowLabel, the same name the catalog and the roll log use.
//
// twoColumns (the GM's display flag, shared with skill tables) splits GM rows and player rows as
// one list — GM rows first, the odd row going left — into two halves side by side. Each half is a
// complete table with its own header, so neither column is left unlabelled, and each counts its
// own zebra parity. The footer stays one, under both.
//
// sortKey (a column key, or null) orders GM and player rows together by that column, before the
// two-column split. Cells write through on every keystroke, so a row being edited is ordered by the
// text it had when its pencil was clicked, and a row just added through the footer stays at the
// bottom until its edit is closed — otherwise it would crawl away from the cursor letter by letter
// (the same rule SkillTable follows). Both only apply while that row is the one being edited, so an
// edit closed from elsewhere on the sheet (editingPath is sheet-wide) leaves nothing stale behind.
//
// Which rows are expanded is view state, like scroll position: local to this component, never
// saved, never broadcast.
function RowTable({
  columns, presets, rows, skillOptions = [], leading = [], trailing = [], labels, twoColumns = false, sortKey = null, showAffordances = false,
  onAdd, onAddFromPreset, onCell, onRemove, editingPath, setEditingPath, showTooltip, hideTooltip,
}) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [pendingRemove, setPendingRemove] = useState(null);
  // Rows added through the footer and not yet closed. State, not derived from an empty cell: a
  // player may blank a name mid-edit, and the row must not jump to the bottom while they type.
  const [newRows, setNewRows] = useState(() => new Set());
  // Sort text each row had when its edit began, by row id. A ref: it is read while rendering the
  // update the pencil click already caused and must never trigger a render of its own.
  const editSortText = useRef({});
  const toggle = id => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const gridTemplate = rowGridTemplate(columns, {
    leading:  leading.map(s => s.track),
    trailing: trailing.map(s => s.track),
  });
  const startEdit = (id) => {
    const row = rows.find(r => r.id === id);
    editSortText.current = { ...editSortText.current, [id]: (row?.cells || {})[sortKey] || '' };
    setEditingPath(id);
  };
  const finishEdit = (id) => {
    const { [id]: _frozen, ...rest } = editSortText.current;
    editSortText.current = rest;
    setNewRows(prev => { const next = new Set(prev); next.delete(id); return next; });
    setEditingPath(null);
  };
  const addRow = () => {
    const id = onAdd();
    setNewRows(prev => new Set(prev).add(id));
    setEditingPath(id);
  };

  const confirmRemove = () => {
    if (editingPath === pendingRemove.id) setEditingPath(null);
    onRemove(pendingRemove.id);
    setPendingRemove(null);
  };

  const shared = { columns, skillOptions, gridTemplate, leading, trailing, labels, showTooltip, hideTooltip };

  const header = (
    <div className="custom-sheet__field-header" style={{ gridTemplateColumns: gridTemplate }}>
      {detailColumns(columns).length > 0 && <span className="custom-sheet__row-table-col-label" />}
      {leading.map(s => <span key={s.key} className="custom-sheet__row-table-col-label">{s.header}</span>)}
      {gridColumns(columns).map(c => (
        <span key={c.key} className="custom-sheet__row-table-col-label">{c.label}</span>
      ))}
      {trailing.map(s => <span key={s.key} className="custom-sheet__row-table-col-label">{s.header}</span>)}
      <span className="custom-sheet__row-table-col-label" />
    </div>
  );

  const unsorted = rows.map(row => ({ row }));
  const isEditing = item => item.row.id === editingPath;
  const pinned = item => isEditing(item) && newRows.has(item.row.id);
  const sortText = (item) => {
    if (isEditing(item) && item.row.id in editSortText.current) return editSortText.current[item.row.id];
    return (item.row.cells || {})[sortKey];
  };
  const items = sortKey
    ? [...sortByText(unsorted.filter(item => !pinned(item)), sortText), ...unsorted.filter(pinned)]
    : unsorted;
  const renderItem = ({ row }) => (
    <RowTablePlayerRow
      key={row.id}
      {...shared}
      row={row}
      editing={editingPath === row.id}
      expanded={expanded.has(row.id)}
      onToggleExpand={() => toggle(row.id)}
      onStartEdit={startEdit}
      onFinishEdit={() => finishEdit(row.id)}
      onCell={onCell}
      showAffordances={showAffordances}
      onRequestRemove={setPendingRemove}
    />
  );
  const halves = twoColumns ? splitHalf(items) : null;

  return (
    <>
      {halves ? (
        <div className="custom-sheet__row-table-cols">
          {halves.map((half, i) => (
            <div key={i} className="custom-sheet__row-table">
              {header}
              {half.map(renderItem)}
            </div>
          ))}
        </div>
      ) : (
        <div className="custom-sheet__row-table">
          {header}
          {items.map(renderItem)}
        </div>
      )}

      {/* Without handlers (the creator's preview) the footer still shows, disabled, because the
          player sees it. A read-only sheet of someone else's character omits it. */}
      {(onAdd || showAffordances) && (
        <div className="custom-sheet__row-table-add-row">
          {/* A new row has no values yet — opening it straight into edit mode saves the player a
              line of em-dashes and a hunt for the pencil. A catalogue pick arrives pre-filled and
              reads fine at rest, so it does not get the same treatment. */}
          <button className="custom-sheet__row-table-add-btn" onClick={onAdd ? addRow : undefined} disabled={!onAdd}>
            + {labels.add}
          </button>
          {presets.length > 0 && (
            <select
              className="custom-sheet__row-table-preset-picker"
              value=""
              disabled={!onAdd}
              onChange={e => {
                const preset = presets.find(p => p.id === e.target.value);
                if (preset) onAddFromPreset(preset);
              }}
            >
              <option value="">+ {labels.addFromList}</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>{rowLabel(columns, p, labels.rowFallback)}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={!!pendingRemove}
        message={pendingRemove ? labels.removeConfirm(rowLabel(columns, pendingRemove, labels.rowFallback)) : ''}
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </>
  );
}

export default RowTable;
