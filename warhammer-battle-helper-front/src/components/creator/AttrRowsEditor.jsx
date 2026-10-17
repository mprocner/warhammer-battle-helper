import React from 'react';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { genId } from '../../utils/surrogateKeys';
import { reorderById, lockToVerticalAxis } from '../../utils/sortableList';

// GM-side editor of an attr_table's rows (PLAYRPG-235). Each row is a full attribute: its id is
// minted once and becomes the key in stats.attributes, so it is never derived from the label.
// Numbers are truncated for the same reason as the attr field's own inputs: a decimal 400s the
// template PATCH, and saveTemplate swallows that error silently.
export const toInt = (raw) => (raw === '' ? null : Math.trunc(Number(raw)));

// One row of the editor. It is its own grid element (not a fragment of a shared grid) because
// useSortable moves the row by a CSS transform on a single node. Only the grip starts a drag:
// the rest of the row is text inputs, and a whole-row drag would fight text selection.
function SortableAttrRow({ row, children, handleLabel }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });
  return (
    <div
      ref={setNodeRef}
      className={`creator__attr-rows-row${isDragging ? ' creator__drag-item--dragging' : ''}`}
      // Translate, not Transform: the sortable strategy also reports a scale that morphs the
      // dragged item into the size of the slot it hovers, which squashes or stretches items of
      // unequal height. Items only swap places; they never change size.
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="creator__drag-grip"
        aria-label={handleLabel}
        {...attributes}
        {...listeners}
      >
        <DragIndicatorIcon style={{ fontSize: 14 }} />
      </button>
      {children}
    </div>
  );
}

function AttrRowsEditor({ rows, onChange }) {
  const { t } = useTranslation();
  const list = rows || [];
  const update = (i, patch) => onChange(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...list, { id: genId('attr'), label: t('creator.attrRowsNewLabel', { n: list.length + 1 }), abbr: '' }]);

  // distance: a press on the grip that never moves 5px stays a click, as in DiceConfigBuilder.
  // The keyboard sensor lets the grip be picked up with Space and moved with the arrow keys.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = ({ active, over }) => {
    const next = reorderById(list, active.id, over?.id);
    if (next !== list) onChange(next);
  };

  // Column name plus the row's label, so each input is distinguishable for assistive tech.
  const aria = (colKey, row) => (row.label ? `${t(colKey)} – ${row.label}` : t(colKey));

  return (
    <div className="creator__attr-rows">
      {list.length === 0 ? (
        <div className="creator__attr-rows-empty">{t('creator.attrRowsEmpty')}</div>
      ) : (
        <div className="creator__attr-rows-list">
          <div className="creator__attr-rows-row creator__attr-rows-row--head">
            <span />
            <span className="creator__attr-rows-head">{t('creator.attrRowsColName')}</span>
            <span className="creator__attr-rows-head">{t('creator.attrRowsColAbbr')}</span>
            <span className="creator__attr-rows-head">{t('creator.attrRowsColDefault')}</span>
            <span className="creator__attr-rows-head">{t('creator.attrRowsColMin')}</span>
            <span className="creator__attr-rows-head">{t('creator.attrRowsColMax')}</span>
            <span className="creator__attr-rows-head">{t('creator.attrRowsColShortCard')}</span>
            <span />
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[lockToVerticalAxis]} onDragEnd={handleDragEnd}>
            <SortableContext items={list.map(r => r.id)} strategy={verticalListSortingStrategy}>
              {list.map((row, i) => (
                <SortableAttrRow key={row.id} row={row} handleLabel={aria('creator.attrRowsReorder', row)}>
                  <input className="creator__option-input" value={row.label || ''} aria-label={aria('creator.attrRowsColName', row)} onChange={e => update(i, { label: e.target.value })} />
                  <input className="creator__option-input" value={row.abbr || ''} aria-label={aria('creator.attrRowsColAbbr', row)} onChange={e => update(i, { abbr: e.target.value })} />
                  <input className="creator__option-input" type="number" step={1} value={row.default ?? ''} aria-label={aria('creator.attrRowsColDefault', row)} onChange={e => update(i, { default: toInt(e.target.value) })} />
                  <input className="creator__option-input" type="number" step={1} value={row.min ?? ''} aria-label={aria('creator.attrRowsColMin', row)} onChange={e => update(i, { min: toInt(e.target.value) })} />
                  <input className="creator__option-input" type="number" step={1} value={row.max ?? ''} aria-label={aria('creator.attrRowsColMax', row)} onChange={e => update(i, { max: toInt(e.target.value) })} />
                  <input type="checkbox" checked={!!row.showOnShortCard} aria-label={aria('creator.attrRowsColShortCard', row)} onChange={e => update(i, { showOnShortCard: e.target.checked })} />
                  <button type="button" className="creator__option-del" aria-label={t('creator.attrRowsDelete')} onClick={() => onChange(list.filter((_, j) => j !== i))}>
                    <DeleteIcon style={{ fontSize: 13 }} />
                  </button>
                </SortableAttrRow>
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
      <button className="creator__option-add-btn creator__attr-rows-add" onClick={add}>
        <AddIcon style={{ fontSize: 13 }} /> {t('creator.attrRowsAdd')}
      </button>
    </div>
  );
}

export default AttrRowsEditor;
