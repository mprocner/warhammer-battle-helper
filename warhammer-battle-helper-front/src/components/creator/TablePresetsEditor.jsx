import React from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, Switch, FormControlLabel } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { genId } from '../../utils/surrogateKeys';
import { CellInput } from '../../systems/custom/fields/RowTableCell';
import SortableList from '../common/sortable/SortableList';
import useSortableItem from '../common/sortable/useSortableItem';
import DragGrip from '../common/sortable/DragGrip';

const PRESET_INPUT_CLASSES = {
  input:    'creator__table-preset-input',
  select:   'creator__table-preset-select',
  textarea: 'creator__table-preset-textarea',
};

// One preset card. The whole card moves under the drag transform; the grip sits at the start of
// the action bar, next to the "add on create" switch, so the card needs no extra head row.
function SortablePreset({ id, gripLabel, addOnCreate, remove, children }) {
  const { rootProps, gripProps, isDragging } = useSortableItem(id);
  return (
    <div {...rootProps} className={`creator__table-preset${isDragging ? ' creator__drag-item--dragging' : ''}`}>
      {children}
      <div className="creator__table-preset-actions">
        <div className="creator__table-preset-actions-start">
          <DragGrip label={gripLabel} {...gripProps} />
          {addOnCreate}
        </div>
        {remove}
      </div>
    </div>
  );
}

// GM editor for a table's preset rows. Each preset is a "row template": the GM fills the same
// cells a player would, plus an "add when a character is created" switch. Every preset is in the
// catalog players copy from; a flagged one is also copied into each new character (a later GM edit
// does not reach existing characters). Whatever else a table's preset carries (a weapon's
// damage) comes in through renderPresetExtra, which receives a patch function for that one
// preset.
// Presets are reordered by their grip; sortedOnSheet says the sheet sorts the table anyway.
function TablePresetsEditor({ columns, presets, onChange, skillOptions = [], icon, labels, renderPresetExtra = null, sortedOnSheet = false }) {
  const { t } = useTranslation();
  const cols = columns || [];

  const update = (i, patch) => onChange(presets.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const updateCell = (i, colKey, val) => update(i, { cells: { ...(presets[i].cells || {}), [colKey]: val } });
  const remove = (i) => onChange(presets.filter((_, j) => j !== i));
  const add = () => onChange([...presets, { id: genId('preset'), cells: {} }]);

  return (
    <div className="creator__table-presets-editor">
      <div className="creator__props-subhead">
        {icon}
        {labels.title}
      </div>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5, fontStyle: 'italic' }}>
        {labels.hint}
      </Typography>

      {cols.length === 0 ? (
        <Typography sx={{ color: 'text.secondary', fontStyle: 'italic', py: 2 }}>
          {labels.noColumns}
        </Typography>
      ) : (
        <div className="creator__table-presets">
          <SortableList items={presets} onReorder={onChange}>
            {presets.map((preset, i) => (
              <SortablePreset
                key={preset.id}
                id={preset.id}
                gripLabel={t('creator.tablePresetReorder', { n: i + 1 })}
                addOnCreate={(
                  <FormControlLabel
                    control={<Switch size="small" checked={!!preset.addOnCreate} onChange={e => update(i, { addOnCreate: e.target.checked })} />}
                    label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem' }}>{t('creator.tablePresetAddOnCreate')}</Typography>}
                  />
                )}
                remove={(
                  <button className="creator__option-del" onClick={() => remove(i)} title={t('creator.sectionDelete')}>
                    <DeleteIcon style={{ fontSize: 14 }} />
                  </button>
                )}
              >
                <div className="creator__table-preset-fields">
                  {cols.map(c => (
                    <label key={c.key} className="creator__table-preset-field">
                      <span className="creator__table-preset-field-label">{c.label}</span>
                      <CellInput
                        column={c}
                        value={(preset.cells && preset.cells[c.key]) || ''}
                        skillOptions={skillOptions}
                        onChange={val => updateCell(i, c.key, val)}
                        classes={PRESET_INPUT_CLASSES}
                      />
                    </label>
                  ))}
                </div>

                {renderPresetExtra && renderPresetExtra(preset, patch => update(i, patch))}
              </SortablePreset>
            ))}
          </SortableList>
          <button className="creator__tree-add-root" onClick={add}>
            <AddIcon style={{ fontSize: 14 }} /> {labels.add}
          </button>
          {/* Differs from the skill hint: catalog presets are not sorted on the sheet,
              so the GM's order still drives the players' add-from-list immediately. */}
          {sortedOnSheet && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontStyle: 'italic', mt: 0.5 }}>
              {t('creator.presetReorderSortedHint')}
            </Typography>
          )}
        </div>
      )}
    </div>
  );
}

export default TablePresetsEditor;
