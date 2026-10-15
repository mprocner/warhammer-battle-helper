import React from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, Switch, FormControlLabel } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { genId } from '../../utils/surrogateKeys';
import { CellInput } from '../../systems/custom/fields/RowTableCell';

const PRESET_INPUT_CLASSES = {
  input:    'creator__table-preset-input',
  select:   'creator__table-preset-select',
  textarea: 'creator__table-preset-textarea',
};

// GM editor for a table's preset rows. Each preset is a "row template": the GM fills the same
// cells a player would, plus an "always on the sheet" switch. Always-on rows are shown read-only on
// every sheet (a GM edit propagates); the rest form a catalog the player can copy into their own
// editable rows. Whatever else a table's preset carries (a weapon's damage) comes in through
// renderPresetExtra, which receives a patch function for that one preset.
function TablePresetsEditor({ columns, presets, onChange, skillOptions = [], icon, labels, renderPresetExtra = null }) {
  const { t } = useTranslation();
  const cols = columns || [];

  const update = (i, patch) => onChange(presets.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const updateCell = (i, colKey, val) => update(i, { cells: { ...(presets[i].cells || {}), [colKey]: val } });
  const remove = (i) => onChange(presets.filter((_, j) => j !== i));
  const add = () => onChange([...presets, { id: genId('preset'), cells: {}, alwaysOn: false }]);

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
          {presets.map((preset, i) => (
            <div key={preset.id} className="creator__table-preset">
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

              <div className="creator__table-preset-actions">
                <FormControlLabel
                  control={<Switch size="small" checked={!!preset.alwaysOn} onChange={e => update(i, { alwaysOn: e.target.checked })} />}
                  label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem' }}>{t('creator.tablePresetAlwaysOn')}</Typography>}
                />
                <button className="creator__option-del" onClick={() => remove(i)} title={t('creator.sectionDelete')}>
                  <DeleteIcon style={{ fontSize: 14 }} />
                </button>
              </div>
            </div>
          ))}
          <button className="creator__tree-add-root" onClick={add}>
            <AddIcon style={{ fontSize: 14 }} /> {labels.add}
          </button>
        </div>
      )}
    </div>
  );
}

export default TablePresetsEditor;
