import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, Switch, FormControlLabel } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { reorderById, lockToVerticalAxis } from '../../utils/sortableList';
import { weaponSkillColumn } from '../../systems/custom/weaponLayout';
import OptionsEditor from './OptionsEditor';

const TYPE_LABEL_KEYS = {
  text:      'creator.tableColTypeText',
  number:    'creator.tableColTypeNumber',
  select:    'creator.tableColTypeSelect',
  long_text: 'creator.tableColTypeLongText',
};

// updateTableColumns patches one column while keeping the invariant that at most one column
// supplies skills. Two columns would not be an error the GM could see — the backend simply rolls
// with the first one in array order (weapon.go:73) — so the creator settles it at edit time
// instead. A column leaving the "select" type also drops the flag: keeping it would leave data
// only the creator honours, while the backend already ignores it.
export function updateTableColumns(cols, index, patch) {
  const next = cols.map((c, j) => (j === index ? { ...c, ...patch } : c));
  const edited = next[index];
  if (edited.type !== 'select' && edited.optionsFromSkills) {
    next[index] = { ...edited, optionsFromSkills: false };
    return next;
  }
  if (edited.type === 'select' && edited.optionsFromSkills) {
    for (let j = 0; j < next.length; j += 1) {
      if (j !== index && next[j].optionsFromSkills) next[j] = { ...next[j], optionsFromSkills: false };
    }
  }
  return next;
}

// One column card. useSortable moves the whole card by a CSS transform on its root node; only the
// grip starts a drag, because the rest of the card is inputs and a whole-card drag would fight
// text selection — the same rule as AttrRowsEditor's rows.
function SortableColumn({ id, gripLabel, head, children }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`creator__table-col${isDragging ? ' creator__drag-item--dragging' : ''}`}
      // Translate, not Transform: the sortable strategy also reports a scale that morphs the
      // dragged item into the size of the slot it hovers, which squashes or stretches items of
      // unequal height. Items only swap places; they never change size.
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div className="creator__table-col-head">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="creator__drag-grip"
          aria-label={gripLabel}
          {...attributes}
          {...listeners}
        >
          <DragIndicatorIcon style={{ fontSize: 14 }} />
        </button>
        {head}
      </div>
      {children}
    </div>
  );
}

// Editor for the GM-defined columns of a weapons_table or data_table. Each column has a stable
// key, a label, a type from `columnTypes`, and — for select columns — a manual options list or,
// with allowSkillColumn (weapons only), "options from the character's skills".
function TableColumnsEditor({ columns, onChange, columnTypes, allowSkillColumn = false }) {
  const { t } = useTranslation();
  const cols = columns || [];
  const [movedFrom, setMovedFrom] = useState(null);
  const skillCol = allowSkillColumn ? weaponSkillColumn({ columns: cols }) : null;

  // commit is the one place that decides whether an edit counts as a hand-over: the column that
  // used to hold the flag differs from the one that holds it now. update, add, remove and drag all
  // go through it, so no edit made here can leave a stale notice behind. The popup switching to a
  // different field is not handled here: PropertyPanel is keyed by the edited path, so that switch
  // unmounts this editor and the notice goes with it.
  const commit = (next) => {
    if (allowSkillColumn) {
      const after = weaponSkillColumn({ columns: next });
      // Only an actual hand-over is announced. A column that merely loses the role (its type
      // changed) leaves the table with none, which the roll-config warning already reports.
      const handover = skillCol && after && skillCol.key !== after.key;
      setMovedFrom(handover ? skillCol.label : null);
    }
    onChange(next);
  };

  const update = (i, patch) => commit(updateTableColumns(cols, i, patch));
  const remove = (i) => commit(cols.filter((_, j) => j !== i));

  // distance: a press on the grip that never moves 5px stays a click, as in AttrRowsEditor. The
  // keyboard sensor lets the grip be picked up with Space and moved with the arrow keys.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = ({ active, over }) => {
    const next = reorderById(cols, active.id, over?.id, c => c.key);
    if (next !== cols) commit(next);
  };
  const add = () => commit([...cols, { key: `col_${Date.now()}`, label: '', type: 'text', options: [], optionsFromSkills: false }]);

  return (
    <div className="creator__table-columns">
      <Typography variant="caption" sx={{ color: 'primary.main', display: 'block', mb: 0.75, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {t('creator.tableColumns')}
      </Typography>
      {movedFrom && (
        <div className="creator__table-col-moved">
          {t('creator.weaponSkillColumnMoved', { column: movedFrom })}
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[lockToVerticalAxis]} onDragEnd={handleDragEnd}>
        <SortableContext items={cols.map(c => c.key)} strategy={verticalListSortingStrategy}>
          {cols.map((col, i) => (
            <SortableColumn
              key={col.key}
              id={col.key}
              gripLabel={col.label ? `${t('creator.tableColumnReorder')} – ${col.label}` : t('creator.tableColumnReorder')}
              head={(
                <>
                  <input
                    className="creator__option-input"
                    value={col.label}
                    placeholder={t('creator.tableColumnLabel')}
                    onChange={e => update(i, { label: e.target.value })}
                  />
                  <select className="creator__option-attr-select" value={col.type} onChange={e => update(i, { type: e.target.value })}>
                    {columnTypes.map(type => <option key={type} value={type}>{t(TYPE_LABEL_KEYS[type])}</option>)}
                  </select>
                  {skillCol && skillCol.key === col.key && (
                    <span className="creator__table-col-badge">{t('creator.weaponSkillColumnBadge')}</span>
                  )}
                  <button className="creator__option-del" onClick={() => remove(i)} title={t('creator.sectionDelete')}><DeleteIcon style={{ fontSize: 13 }} /></button>
                </>
              )}
            >
              {col.type === 'select' && (
                <div className="creator__table-col-select">
                  {allowSkillColumn && (
                    <FormControlLabel
                      control={<Switch size="small" checked={!!col.optionsFromSkills} onChange={e => update(i, { optionsFromSkills: e.target.checked })} />}
                      label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem' }}>{t('creator.weaponColFromSkills')}</Typography>}
                      sx={{ display: 'block' }}
                    />
                  )}
                  {!(allowSkillColumn && col.optionsFromSkills) && (
                    <OptionsEditor label={t('creator.selectOptions')} options={col.options || []} onChange={opts => update(i, { options: opts })} />
                  )}
                </div>
              )}
            </SortableColumn>
          ))}
        </SortableContext>
      </DndContext>
      <button className="creator__tree-add-root" onClick={add}>
        <AddIcon style={{ fontSize: 14 }} /> {t('creator.tableAddColumn')}
      </button>
    </div>
  );
}

export default TableColumnsEditor;
