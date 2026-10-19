import React from 'react';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { genId } from '../../utils/surrogateKeys';
import SortableList from '../common/sortable/SortableList';
import useSortableItem from '../common/sortable/useSortableItem';
import DragGrip from '../common/sortable/DragGrip';

// GM-side editor of an attr_table's rows (PLAYRPG-235). Each row is a full attribute: its id is
// minted once and becomes the key in stats.attributes, so it is never derived from the label.
// Numbers are truncated for the same reason as the attr field's own inputs: a decimal 400s the
// template PATCH, and saveTemplate swallows that error silently.
export const toInt = (raw) => (raw === '' ? null : Math.trunc(Number(raw)));

// One row of the editor. It is its own grid element (not a fragment of a shared grid) because the
// row moves as a single node under the drag transform.
function SortableAttrRow({ row, children, handleLabel }) {
  const { rootProps, gripProps, isDragging } = useSortableItem(row.id);
  return (
    <div {...rootProps} className={`creator__attr-rows-row${isDragging ? ' creator__drag-item--dragging' : ''}`}>
      <DragGrip label={handleLabel} {...gripProps} />
      {children}
    </div>
  );
}

function AttrRowsEditor({ rows, onChange }) {
  const { t } = useTranslation();
  const list = rows || [];
  const update = (i, patch) => onChange(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => onChange([...list, { id: genId('attr'), label: t('creator.attrRowsNewLabel', { n: list.length + 1 }), abbr: '' }]);

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
          <SortableList items={list} onReorder={onChange}>
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
          </SortableList>
        </div>
      )}
      <button className="creator__option-add-btn creator__attr-rows-add" onClick={add}>
        <AddIcon style={{ fontSize: 13 }} /> {t('creator.attrRowsAdd')}
      </button>
    </div>
  );
}

export default AttrRowsEditor;
