import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogTitle, DialogContent, IconButton, Typography, Box,
  TextField, Switch, FormControlLabel, Select, MenuItem, InputLabel,
  FormControl, Divider, Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import NumbersIcon from '@mui/icons-material/Numbers';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ShortTextIcon from '@mui/icons-material/ShortText';
import SubjectIcon from '@mui/icons-material/Subject';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import ListIcon from '@mui/icons-material/List';
import TableRowsIcon from '@mui/icons-material/TableRows';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import GavelIcon from '@mui/icons-material/Gavel';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';
import {
  DndContext as DndKitContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import CustomSheetBody, { collectSkillOptions, renderDamageFormula } from '../../systems/custom/CustomSheetBody';
import FormulaBuilder from './FormulaBuilder';
import DiceConfigBuilder from './DiceConfigBuilder';
import TokenDisplayBuilder from './TokenDisplayBuilder';
import { duplicateFieldInSections } from '../../utils/templateFields';

// ── helpers ──────────────────────────────────────────────────────────────────

// genId mints a stable, opaque identifier used as the durable key for fields and skill
// options. It is generated once and never derived from a label, so renaming never orphans
// the data stored under "<key>" / "<fieldKey>.<optionId>".
function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function updateTreeAtPath(node, path, updater) {
  if (path.length === 0) return updater(node);
  const idx = path[0];
  return {
    ...node,
    children: node.children.map((c, i) =>
      i === idx ? updateTreeAtPath(c, path.slice(1), updater) : c
    ),
  };
}

function addChildAtPath(node, path) {
  if (path.length === 0) {
    const children = node.children || [];
    return { ...node, children: [...children, { key: genId('node'), label: 'Węzeł', children: [], linkedAttr: '' }] };
  }
  const idx = path[0];
  return { ...node, children: node.children.map((c, i) => i === idx ? addChildAtPath(c, path.slice(1)) : c) };
}

function removeAtPath(node, path) {
  if (path.length === 1) {
    return { ...node, children: node.children.filter((_, i) => i !== path[0]) };
  }
  const idx = path[0];
  return { ...node, children: node.children.map((c, i) => i === idx ? removeAtPath(c, path.slice(1)) : c) };
}

// ── field type config ─────────────────────────────────────────────────────────

const FIELD_TYPES = [
  { type: 'attr',        labelKey: 'creator.fieldType.attr',        icon: <NumbersIcon fontSize="small" />,    desc: 'creator.fieldType.attrDesc' },
  { type: 'number',      labelKey: 'creator.fieldType.number',      icon: <NumbersIcon fontSize="small" />,    desc: 'creator.fieldType.numberDesc' },
  { type: 'progress',    labelKey: 'creator.fieldType.progress',    icon: <TrendingUpIcon fontSize="small" />, desc: 'creator.fieldType.progressDesc' },
  { type: 'text_short',  labelKey: 'creator.fieldType.textShort',   icon: <ShortTextIcon fontSize="small" />,  desc: 'creator.fieldType.textShortDesc' },
  { type: 'text_long',   labelKey: 'creator.fieldType.textLong',    icon: <SubjectIcon fontSize="small" />,    desc: 'creator.fieldType.textLongDesc' },
  { type: 'checkbox',    labelKey: 'creator.fieldType.checkbox',    icon: <CheckBoxIcon fontSize="small" />,   desc: 'creator.fieldType.checkboxDesc' },
  { type: 'select',      labelKey: 'creator.fieldType.select',      icon: <ListIcon fontSize="small" />,       desc: 'creator.fieldType.selectDesc' },
  { type: 'skill_table',   labelKey: 'creator.fieldType.skillTable',    icon: <TableRowsIcon fontSize="small" />,  desc: 'creator.fieldType.skillTableDesc' },
  { type: 'weapons_table', labelKey: 'creator.fieldType.weaponsTable',  icon: <GavelIcon fontSize="small" />,      desc: 'creator.fieldType.weaponsTableDesc' },
  { type: 'skill_tree',    labelKey: 'creator.fieldType.skillTree',     icon: <AccountTreeIcon fontSize="small" />, desc: 'creator.fieldType.skillTreeDesc' },
];

const PALETTE_GROUPS = [
  { labelKey: 'creator.paletteGroupStats',   types: ['attr', 'number', 'progress'] },
  { labelKey: 'creator.paletteGroupText',    types: ['text_short', 'text_long'] },
  { labelKey: 'creator.paletteGroupChoice',  types: ['checkbox', 'select'] },
  { labelKey: 'creator.paletteGroupTables',  types: ['skill_table', 'weapons_table', 'skill_tree'] },
];

function makeDefaultField(type) {
  const base = {
    key: genId(type),
    type,
    label: '',
    abbr: '',
    showToPlayer: true,
    rollable: false,
  };
  if (type === 'attr') return { ...base, min: 0, max: 100, showOnShortCard: false, hasAdvances: false, advancesLabel: 'Rozwinięcie' };
  if (type === 'number') return { ...base, min: 0, max: 100, showOnShortCard: false };
  if (type === 'progress') return { ...base, showOnShortCard: false };
  if (type === 'select') return { ...base, options: [] };
  if (type === 'skill_table') return { ...base, skills: [], rollable: true, showOnShortCard: false, assignAttrToSkill: false, hasAdvances: false, advancesLabel: 'Rozwinięcie' };
  if (type === 'weapons_table') return { ...base, columns: [], rollable: true, rollConfig: defaultRollConfig(), damageFormula: [], presetWeapons: [] };
  if (type === 'skill_tree') return { ...base, tree: { key: genId('tree'), label: 'Kategoria', children: [] }, showOnShortCard: false, playerCanAddSkills: false, assignAttrToSkill: false };
  return base;
}

function makeDefaultSection() {
  return { id: genId('section'), title: '', columns: 3, fields: [] };
}

function typeInfo(type) {
  return FIELD_TYPES.find(ft => ft.type === type);
}

// ── SkillTreeEditor ──────────────────────────────────────────────────────────

function SkillTreeEditor({ tree, onChange, numberFields, assignAttrToSkill = false }) {
  const { t } = useTranslation();
  const renderNode = (node, path, depth) => {
    return (
      <div key={path.join('-')} style={{ paddingLeft: depth * 16 }}>
        <div className="creator__tree-node">
          <input
            className="creator__tree-node-input"
            value={node.label}
            onChange={e => onChange(updateTreeAtPath(tree, path, n => ({ ...n, label: e.target.value, key: n.key || genId('node') })))}
            placeholder={t('creator.treeNodePlaceholder')}
          />
          {assignAttrToSkill && (
            <select
              className="creator__tree-attr-select"
              value={node.linkedAttr || ''}
              onChange={e => onChange(updateTreeAtPath(tree, path, n => ({ ...n, linkedAttr: e.target.value })))}
            >
              <option value="">{t('creator.treeAttrSelect')}</option>
              {numberFields.map(f => <option key={f.key} value={f.key}>{f.abbr || f.label}</option>)}
            </select>
          )}
          <button className="creator__tree-btn creator__tree-btn--add" onClick={() => onChange(addChildAtPath(tree, path))} title={t('creator.treeAddNode')}>
            <AddIcon style={{ fontSize: 14 }} />
          </button>
          {path.length > 0 && (
            <button
              className="creator__tree-btn creator__tree-btn--del"
              onClick={() => {
                const parent = path.slice(0, -1);
                const parentNode = parent.length === 0 ? tree : path.slice(0, -1).reduce((n, i) => n.children[i], tree);
                if (parentNode.children.length <= 1 && path.length === 1) return;
                onChange(removeAtPath(tree, path));
              }}
              title={t('creator.treeRemoveNode')}
            >
              <DeleteIcon style={{ fontSize: 14 }} />
            </button>
          )}
        </div>
        {(node.children || []).map((child, i) => renderNode(child, [...path, i], depth + 1))}
      </div>
    );
  };

  return (
    <div className="creator__skill-tree-editor">
      {(tree.children || []).map((child, i) => renderNode(child, [i], 0))}
      <button className="creator__tree-add-root" onClick={() => onChange(addChildAtPath(tree, []))}>
        <AddIcon style={{ fontSize: 14 }} /> {t('creator.treeAddCategory')}
      </button>
    </div>
  );
}

// ── OptionsEditor ────────────────────────────────────────────────────────────

// Plain-string options editor for "select" fields and weapon select-columns. The stored
// value IS the label (no stable id needed — a select stores the chosen text verbatim).
function OptionsEditor({ label, options, onChange }) {
  const { t } = useTranslation();
  const [draftLabel, setDraftLabel] = useState('');

  const commit = () => {
    if (!draftLabel.trim()) return;
    onChange([...(options || []), draftLabel.trim()]);
    setDraftLabel('');
  };

  return (
    <div className="creator__options-editor">
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>{label}</Typography>
      <div className="creator__options-list">
        {(options || []).map((opt, i) => (
          <div key={i} className="creator__option-row">
            <input className="creator__option-input" value={opt} onChange={e => {
              const n = [...options];
              n[i] = e.target.value;
              onChange(n);
            }} />
            <button className="creator__option-del" onClick={() => onChange((options || []).filter((_, j) => j !== i))}><DeleteIcon style={{ fontSize: 13 }} /></button>
          </div>
        ))}
      </div>
      <div className="creator__options-add">
        <input
          className="creator__option-input"
          value={draftLabel}
          onChange={e => setDraftLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
          placeholder={t('creator.optionsAddPlaceholder')}
        />
        <button className="creator__option-add-btn" onClick={commit}>
          <AddIcon style={{ fontSize: 13 }} />
        </button>
      </div>
    </div>
  );
}

// ── SkillOptionsEditor ───────────────────────────────────────────────────────

// Skill rows for a "skill_table" field. Each row is { id, label, attr? }: id is a stable key
// minted once (never derived from label), so renaming a skill keeps the player's stored value
// under "<fieldKey>.<id>". attr is only edited when the field has assignAttrToSkill enabled.
function SkillOptionsEditor({ label, skills, onChange, assignAttrToSkill = false, numberFields = [] }) {
  const { t } = useTranslation();
  const [draftLabel, setDraftLabel] = useState('');
  const [draftAttr,  setDraftAttr]  = useState('');
  const list = skills || [];

  const commit = () => {
    if (!draftLabel.trim()) return;
    onChange([...list, { id: genId('skill'), label: draftLabel.trim(), attr: assignAttrToSkill ? draftAttr : '' }]);
    setDraftLabel(''); setDraftAttr('');
  };
  const update = (i, patch) => onChange(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="creator__options-editor">
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>{label}</Typography>
      <div className="creator__options-list">
        {list.map((opt, i) => (
          <div key={opt.id} className="creator__option-row">
            <input className="creator__option-input" value={opt.label} onChange={e => update(i, { label: e.target.value })} />
            {assignAttrToSkill && (
              <select className="creator__option-attr-select" value={opt.attr || ''} onChange={e => update(i, { attr: e.target.value })}>
                <option value="">{t('creator.optionsNoAttr')}</option>
                {numberFields.map(f => <option key={f.key} value={f.key}>{f.abbr || f.label}</option>)}
              </select>
            )}
            <button className="creator__option-del" onClick={() => onChange(list.filter((_, j) => j !== i))}><DeleteIcon style={{ fontSize: 13 }} /></button>
          </div>
        ))}
      </div>
      <div className="creator__options-add">
        <input
          className="creator__option-input"
          value={draftLabel}
          onChange={e => setDraftLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }}
          placeholder={t('creator.optionsAddPlaceholder')}
        />
        {assignAttrToSkill && (
          <select className="creator__option-attr-select" value={draftAttr} onChange={e => setDraftAttr(e.target.value)}>
            <option value="">{t('creator.optionsNoAttr')}</option>
            {numberFields.map(f => <option key={f.key} value={f.key}>{f.abbr || f.label}</option>)}
          </select>
        )}
        <button className="creator__option-add-btn" onClick={commit}>
          <AddIcon style={{ fontSize: 13 }} />
        </button>
      </div>
    </div>
  );
}

// ── WeaponColumnsEditor ──────────────────────────────────────────────────────

// Editor for the GM-defined columns of a weapons_table field. Each column has a
// stable key, a label, a type (text/number/select), and — for select columns —
// either a manual options list or "options from the character's skills".
function WeaponColumnsEditor({ columns, onChange }) {
  const { t } = useTranslation();
  const cols = columns || [];
  const update = (i, patch) => onChange(cols.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const remove = (i) => onChange(cols.filter((_, j) => j !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= cols.length) return;
    const next = [...cols];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => onChange([...cols, { key: `col_${Date.now()}`, label: '', type: 'text', options: [], optionsFromSkills: false }]);

  return (
    <div className="creator__weapon-columns">
      <Typography variant="caption" sx={{ color: 'primary.main', display: 'block', mb: 0.75, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {t('creator.weaponColumns')}
      </Typography>
      {cols.map((col, i) => (
        <div key={col.key} className="creator__weapon-col">
          <div className="creator__weapon-col-head">
            <input
              className="creator__option-input"
              value={col.label}
              placeholder={t('creator.weaponColumnLabel')}
              onChange={e => update(i, { label: e.target.value })}
            />
            <select className="creator__option-attr-select" value={col.type} onChange={e => update(i, { type: e.target.value })}>
              <option value="text">{t('creator.weaponColTypeText')}</option>
              <option value="number">{t('creator.weaponColTypeNumber')}</option>
              <option value="select">{t('creator.weaponColTypeSelect')}</option>
            </select>
            <button className="creator__option-del" onClick={() => move(i, -1)} disabled={i === 0} title={t('creator.sectionMoveUp')}><ArrowUpwardIcon style={{ fontSize: 13 }} /></button>
            <button className="creator__option-del" onClick={() => move(i, +1)} disabled={i === cols.length - 1} title={t('creator.sectionMoveDown')}><ArrowDownwardIcon style={{ fontSize: 13 }} /></button>
            <button className="creator__option-del" onClick={() => remove(i)} title={t('creator.sectionDelete')}><DeleteIcon style={{ fontSize: 13 }} /></button>
          </div>
          {col.type === 'select' && (
            <div className="creator__weapon-col-select">
              <FormControlLabel
                control={<Switch size="small" checked={!!col.optionsFromSkills} onChange={e => update(i, { optionsFromSkills: e.target.checked })} />}
                label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem' }}>{t('creator.weaponColFromSkills')}</Typography>}
                sx={{ display: 'block' }}
              />
              {!col.optionsFromSkills && (
                <OptionsEditor label={t('creator.selectOptions')} options={col.options || []} onChange={opts => update(i, { options: opts })} />
              )}
            </div>
          )}
        </div>
      ))}
      <button className="creator__tree-add-root" onClick={add}>
        <AddIcon style={{ fontSize: 14 }} /> {t('creator.weaponAddColumn')}
      </button>
    </div>
  );
}

// ── RollConfigEditor ─────────────────────────────────────────────────────────

function defaultRollConfig() {
  return {
    rollMode: 'traditional',
    formula: [],
    successType: 'below_threshold',
    rollAdvType: 'standard',
    poolSuccessThreshold: 6,
    poolSuccessCondition: 'gte',
  };
}

function RollConfigEditor({ config, onChange, numberFields, fieldType }) {
  const { t } = useTranslation();
  const up = patch => onChange({ ...config, ...patch });
  const rollMode = config.rollMode || 'traditional';

  return (
    <div className="creator__roll-config">
      <Typography variant="caption" sx={{ color: 'primary.main', display: 'block', mb: 0.75, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {t('creator.rollMechanics')}
      </Typography>

      <div className="creator__roll-mode-toggle">
        {['traditional', 'dice_pool'].map(mode => (
          <button
            key={mode}
            className={`creator__roll-mode-opt${rollMode === mode ? ' creator__roll-mode-opt--active' : ''}`}
            onClick={() => up({ rollMode: mode })}
          >
            {t(mode === 'traditional' ? 'creator.rollModeTraditional' : 'creator.rollModeDicePool')}
          </button>
        ))}
      </div>

      <FormulaBuilder
        formula={config.formula || []}
        onChange={formula => up({ formula })}
        numberFields={numberFields}
        fieldType={fieldType}
        hideOperators={rollMode === 'dice_pool' ? ['/'] : []}
      />

      <Divider sx={{ my: 1.5 }} />

      {rollMode === 'traditional' ? (
        <FormControl fullWidth size="small" sx={{ mb: 1 }}>
          <InputLabel sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem' }}>{t('creator.rollSuccessCondition')}</InputLabel>
          <Select value={config.successType || 'below_threshold'} label={t('creator.rollSuccessCondition')} onChange={e => up({ successType: e.target.value })} sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem' }}>
            <MenuItem value="below_threshold">{t('creator.rollBelowThreshold')}</MenuItem>
            <MenuItem value="above_threshold">{t('creator.rollAboveThreshold')}</MenuItem>
            <MenuItem value="raw">{t('creator.rollRaw')}</MenuItem>
          </Select>
        </FormControl>
      ) : (
        <>
          <FormControl fullWidth size="small" sx={{ mb: 1 }}>
            <InputLabel sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem' }}>{t('creator.dicePoolSuccessCondition')}</InputLabel>
            <Select value={config.poolSuccessCondition || 'gte'} label={t('creator.dicePoolSuccessCondition')} onChange={e => up({ poolSuccessCondition: e.target.value })} sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem' }}>
              <MenuItem value="gte">{t('creator.dicePoolConditionGte')}</MenuItem>
              <MenuItem value="eq">{t('creator.dicePoolConditionEq')}</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            fullWidth
            type="number"
            label={t('creator.dicePoolSuccessThreshold')}
            value={config.poolSuccessThreshold ?? 6}
            onChange={e => up({ poolSuccessThreshold: parseInt(e.target.value, 10) || 1 })}
            sx={{ mb: 1 }}
            InputProps={{ sx: { fontFamily: 'Crimson Text, serif', fontSize: '0.85rem' }, inputProps: { min: 1 } }}
          />
        </>
      )}
    </div>
  );
}

// ── WeaponPresetsModal ───────────────────────────────────────────────────────

// GM editor for a weapons_table field's preset weapons. Each preset is a "row template":
// the GM fills the same column cells and damage blocks a player would, plus an "always on
// the sheet" switch. AlwaysOn presets are shown read-only on every sheet (a GM edit
// propagates); the rest form a catalog the player can copy into their own editable rows.
// Lives in its own dialog so it never crowds the field property panel on the right.
function WeaponPresetsModal({ open, onClose, field, sections, onChange }) {
  const { t } = useTranslation();
  const presets   = field.presetWeapons || [];
  const cols      = field.columns || [];
  const dmgBlocks = field.damageFormula || [];
  const hasDamage = dmgBlocks.length > 0;
  // "from skills" columns resolve to the skills defined in the template (no character yet).
  const skillOptions = cols.some(c => c.type === 'select' && c.optionsFromSkills)
    ? collectSkillOptions(sections, {})
    : [];

  const update = (i, patch) => onChange(presets.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const updateCell   = (i, colKey, val)   => update(i, { cells:  { ...(presets[i].cells  || {}), [colKey]: val } });
  const updateDamage = (i, blockId, val)  => update(i, { damage: { ...(presets[i].damage || {}), [blockId]: Number(val) || 0 } });
  const remove = (i) => onChange(presets.filter((_, j) => j !== i));
  const add = () => onChange([
    ...presets,
    { id: genId('preset'), cells: {}, damage: {}, alwaysOn: false },
  ]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { background: 'linear-gradient(135deg, #f4e8d8 0%, #e8dcc4 100%)' } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontFamily: 'Cinzel, serif', color: '#7a5c42', fontSize: '1rem' }}>
        <GavelIcon fontSize="small" />
        {t('creator.weaponPresetsTitle')}
        <IconButton onClick={onClose} size="small" sx={{ ml: 'auto' }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5, fontStyle: 'italic' }}>
          {t('creator.weaponPresetsHint')}
        </Typography>

        {cols.length === 0 ? (
          <Typography sx={{ color: 'text.secondary', fontStyle: 'italic', py: 2 }}>
            {t('creator.weaponPresetsNoColumns')}
          </Typography>
        ) : (
          <div className="creator__weapon-presets">
            {presets.map((preset, i) => (
              <div key={preset.id} className="creator__weapon-preset">
                <div className="creator__weapon-preset-fields">
                  {cols.map(c => {
                    const val = (preset.cells && preset.cells[c.key]) || '';
                    if (c.type === 'select') {
                      const opts = c.optionsFromSkills
                        ? skillOptions
                        : (c.options || []).map(o => ({ key: o, label: o }));
                      return (
                        <label key={c.key} className="creator__weapon-preset-field">
                          <span className="creator__weapon-preset-field-label">{c.label}</span>
                          <select className="custom-sheet__weapon-cell-select" value={val}
                            onChange={e => updateCell(i, c.key, e.target.value)}>
                            <option value="">—</option>
                            {opts.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                          </select>
                        </label>
                      );
                    }
                    return (
                      <label key={c.key} className="creator__weapon-preset-field">
                        <span className="creator__weapon-preset-field-label">{c.label}</span>
                        <input type={c.type === 'number' ? 'number' : 'text'} className="custom-sheet__weapon-cell-input"
                          value={val} onChange={e => updateCell(i, c.key, e.target.value)} />
                      </label>
                    );
                  })}
                </div>

                {hasDamage && (
                  <div className="creator__weapon-preset-damage">
                    <span className="creator__weapon-preset-field-label">{t('customSheet.damage')}</span>
                    <div className="custom-sheet__weapon-damage">
                      {renderDamageFormula(dmgBlocks, preset, field.key,
                        { weaponDamage: (_fk, _rowId, blockId, val) => updateDamage(i, blockId, val) }, false, t)}
                    </div>
                  </div>
                )}

                <div className="creator__weapon-preset-actions">
                  <FormControlLabel
                    control={<Switch size="small" checked={!!preset.alwaysOn} onChange={e => update(i, { alwaysOn: e.target.checked })} />}
                    label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem' }}>{t('creator.weaponPresetAlwaysOn')}</Typography>}
                  />
                  <button className="creator__option-del" onClick={() => remove(i)} title={t('creator.sectionDelete')}>
                    <DeleteIcon style={{ fontSize: 14 }} />
                  </button>
                </div>
              </div>
            ))}
            <button className="creator__tree-add-root" onClick={add}>
              <AddIcon style={{ fontSize: 14 }} /> {t('creator.weaponPresetAdd')}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── PropertyPanel (field) ────────────────────────────────────────────────────

function PropertyPanel({ field, onChange, numberFields, sections }) {
  const { t } = useTranslation();
  const [presetsOpen, setPresetsOpen] = useState(false);
  if (!field) {
    return (
      <div className="creator__props-empty">
        <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', textAlign: 'center' }}>
          {t('creator.selectFieldHint')}
        </Typography>
      </div>
    );
  }

  const up = (patch) => onChange({ ...field, ...patch });

  return (
    <div className="creator__props-panel">
      <Typography variant="subtitle2" sx={{ fontFamily: 'Cinzel, serif', color: 'primary.main', mb: 1.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.75rem' }}>
        {t('creator.fieldProperties')}
      </Typography>

      {/* key is an internal, immutable surrogate id (see genId) — never derived from the label,
          so renaming a field never orphans player data stored under it. Not shown to the GM. */}
      <TextField size="small" fullWidth label={t('creator.fieldLabel')} value={field.label}
        onChange={e => up({ label: e.target.value })}
        sx={{ mb: 1.5 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }} />

      {(field.type === 'attr' || field.type === 'number' || field.type === 'progress' || field.type === 'skill_table' || field.type === 'skill_tree') && (
        <TextField size="small" fullWidth label={t('creator.fieldAbbr')} value={field.abbr || ''}
          onChange={e => up({ abbr: e.target.value })}
          helperText={t('creator.fieldAbbrHint')}
          sx={{ mb: 1.5 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }} />
      )}

      {(field.type === 'attr' || field.type === 'number' || field.type === 'progress' || field.type === 'skill_table' || field.type === 'skill_tree') && (
        <FormControlLabel
          control={<Switch checked={!!field.showOnShortCard} onChange={e => up({ showOnShortCard: e.target.checked })} size="small" />}
          label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t('creator.showOnShortCard')}</Typography>}
          sx={{ mb: 1.5, display: 'block' }}
        />
      )}

      {(field.type === 'attr' || field.type === 'number') && (
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <TextField size="small" label="Min" type="number" value={field.min ?? ''} onChange={e => up({ min: e.target.value === '' ? null : Number(e.target.value) })} sx={{ flex: 1 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }} />
          <TextField size="small" label="Max" type="number" value={field.max ?? ''} onChange={e => up({ max: e.target.value === '' ? null : Number(e.target.value) })} sx={{ flex: 1 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }} />
          <TextField size="small" label={t('creator.fieldDefault')} type="number" value={field.default ?? ''} onChange={e => up({ default: e.target.value === '' ? null : Number(e.target.value) })} sx={{ flex: 1 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }} />
        </Box>
      )}

      {field.type === 'attr' && (
        <>
          <FormControlLabel
            control={<Switch checked={!!field.hasAdvances} onChange={e => up({ hasAdvances: e.target.checked })} size="small" />}
            label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t('creator.fieldAdvances')}</Typography>}
            sx={{ mb: 0.5 }}
          />
          {field.hasAdvances && (
            <TextField
              size="small"
              fullWidth
              label={t('creator.fieldAdvancesLabel')}
              value={field.advancesLabel ?? t('creator.fieldAdvancesDefault')}
              onChange={e => up({ advancesLabel: e.target.value })}
              sx={{ mb: 1.5 }}
              InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }}
            />
          )}
        </>
      )}

      {(field.type === 'skill_table' || field.type === 'skill_tree') && (
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={!!field.assignAttrToSkill}
              onChange={e => up({ assignAttrToSkill: e.target.checked })}
            />
          }
          label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t('creator.fieldAssignAttr')}</Typography>}
          sx={{ mb: 1, display: 'block' }}
        />
      )}

      {field.type === 'skill_table' && (
        <>
          <FormControlLabel
            control={<Switch checked={!!field.hasAdvances} onChange={e => up({ hasAdvances: e.target.checked })} size="small" />}
            label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t('creator.fieldAdvances')}</Typography>}
            sx={{ mb: 0.5, display: 'block' }}
          />
          {field.hasAdvances && (
            <TextField
              size="small"
              fullWidth
              label={t('creator.fieldAdvancesLabel')}
              value={field.advancesLabel ?? t('creator.fieldAdvancesDefault')}
              onChange={e => up({ advancesLabel: e.target.value })}
              sx={{ mb: 1.5 }}
              InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }}
            />
          )}
        </>
      )}

      {field.type === 'select' && (
        <OptionsEditor
          label={t('creator.selectOptions')}
          options={field.options || []}
          onChange={opts => up({ options: opts })}
        />
      )}

      {field.type === 'skill_table' && (
        <SkillOptionsEditor
          label={t('creator.skillTableSkills')}
          skills={field.skills || []}
          onChange={skills => up({ skills })}
          assignAttrToSkill={!!field.assignAttrToSkill}
          numberFields={numberFields}
        />
      )}

      {field.type === 'weapons_table' && (
        <>
          <WeaponColumnsEditor columns={field.columns || []} onChange={cols => up({ columns: cols })} />

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="caption" sx={{ color: 'primary.main', display: 'block', mb: 0.75, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('creator.weaponAttackRoll')}
          </Typography>
          <RollConfigEditor
            config={field.rollConfig || defaultRollConfig()}
            onChange={cfg => up({ rollConfig: cfg })}
            numberFields={numberFields}
            fieldType={field.type}
          />

          <Divider sx={{ my: 1.5 }} />
          <Typography variant="caption" sx={{ color: 'primary.main', display: 'block', mb: 0.75, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('creator.damageFormula')}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75, fontStyle: 'italic' }}>
            {t('creator.damageFormulaHint')}
          </Typography>
          <FormulaBuilder
            formula={field.damageFormula || []}
            onChange={f => up({ damageFormula: f })}
            numberFields={numberFields}
            fieldType={field.type}
            damageMode
          />

          <Divider sx={{ my: 1.5 }} />
          <button className="creator__weapon-presets-btn" onClick={() => setPresetsOpen(true)}>
            <GavelIcon style={{ fontSize: 15 }} />
            {t('creator.weaponPresetsButton', { count: (field.presetWeapons || []).length })}
          </button>
          <WeaponPresetsModal
            open={presetsOpen}
            onClose={() => setPresetsOpen(false)}
            field={field}
            sections={sections}
            onChange={presetWeapons => up({ presetWeapons })}
          />
        </>
      )}

      <Divider sx={{ my: 1.5 }} />

      <FormControlLabel control={<Switch checked={!!field.showToPlayer} onChange={e => up({ showToPlayer: e.target.checked })} size="small" />}
        label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t('creator.showToPlayer')}</Typography>} sx={{ mb: 0.5 }} />

      {(field.type === 'attr' || field.type === 'skill_table' || field.type === 'skill_tree') && (
        <FormControlLabel control={<Switch checked={!!field.rollable} onChange={e => up({ rollable: e.target.checked, rollConfig: e.target.checked ? (field.rollConfig || defaultRollConfig()) : null })} size="small" />}
          label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t('creator.rollable')}</Typography>} sx={{ mb: 0.5 }} />
      )}

      {field.rollable && field.rollConfig && (field.type === 'attr' || field.type === 'skill_table' || field.type === 'skill_tree') && (
        <RollConfigEditor config={field.rollConfig} onChange={cfg => up({ rollConfig: cfg })} numberFields={numberFields} fieldType={field.type} />
      )}

      {field.type === 'skill_tree' && (
        <FormControlLabel
          control={<Switch checked={!!field.playerCanAddSkills} onChange={e => up({ playerCanAddSkills: e.target.checked })} size="small" />}
          label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t('creator.playerCanAddSkills')}</Typography>}
          sx={{ mb: 0.5 }}
        />
      )}

      {field.type === 'skill_tree' && field.tree && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('creator.treeStructure')}
          </Typography>
          <SkillTreeEditor tree={field.tree} onChange={tree => up({ tree })} numberFields={numberFields} assignAttrToSkill={!!field.assignAttrToSkill} />
        </>
      )}
    </div>
  );
}

// ── SectionPropertyPanel ─────────────────────────────────────────────────────

function SectionPropertyPanel({ section, onChange, onDelete, sectionIdx, totalSections, onMove }) {
  const { t } = useTranslation();
  return (
    <div className="creator__props-panel">
      <Typography variant="subtitle2" sx={{ fontFamily: 'Cinzel, serif', color: 'primary.main', mb: 1.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.85rem' }}>
        {t('creator.sectionProperties')}
      </Typography>

      <TextField
        size="small"
        fullWidth
        label={t('creator.sectionTitleLabel')}
        value={section.title}
        onChange={e => onChange({ title: e.target.value })}
        sx={{ mb: 2 }}
        InputProps={{ sx: { fontFamily: 'Cinzel, serif', fontSize: '0.95rem' } }}
      />

      <div style={{ marginBottom: 16 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', display: 'block', mb: 0.75, fontSize: '0.8rem' }}>
          {t('creator.sectionColumns')}
        </Typography>
        <div className="creator__layout-options">
          {[1, 2, 3, 4, 5, 6].map(n => {
            const barWidth = Math.max(3, Math.round((36 - (n - 1) * 2) / n));
            return (
              <button
                key={n}
                className={`creator__layout-opt${section.columns === n ? ' creator__layout-opt--active' : ''}`}
                onClick={() => onChange({ columns: n })}
              >
                <div className="creator__layout-visual">
                  {Array.from({ length: n }).map((_, i) => (
                    <div key={i} className="creator__layout-bar" style={{ width: barWidth }} />
                  ))}
                </div>
                <div className="creator__layout-label">{n} {t('creator.colSuffix')}</div>
              </button>
            );
          })}
        </div>
      </div>

      <Divider sx={{ my: 1.5 }} />

      <Box sx={{ display: 'flex', gap: 1 }}>
        <button className="creator__section-action-btn" onClick={() => onMove(sectionIdx, -1)} disabled={sectionIdx === 0} title={t('creator.sectionMoveUp')}>
          <ArrowUpwardIcon style={{ fontSize: 14 }} />
        </button>
        <button className="creator__section-action-btn" onClick={() => onMove(sectionIdx, +1)} disabled={sectionIdx === totalSections - 1} title={t('creator.sectionMoveDown')}>
          <ArrowDownwardIcon style={{ fontSize: 14 }} />
        </button>
        <button className="creator__section-action-btn creator__section-action-btn--danger" onClick={onDelete} title={t('creator.sectionDelete')} style={{ marginLeft: 'auto' }}>
          <DeleteIcon style={{ fontSize: 14 }} />
        </button>
      </Box>
    </div>
  );
}

// ── FieldCard (in section canvas) ────────────────────────────────────────────

function FieldCard({ id, field, isSelected, isDuplicateKey, onClick, onRemove, onDuplicate, onMoveUp, onMoveDown, isFirst, isLast }) {
  const { t } = useTranslation();
  const ti = typeInfo(field.type);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const dndStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      className={`creator__canvas-field${isSelected ? ' creator__canvas-field--selected' : ''}${isDuplicateKey ? ' creator__canvas-field--error' : ''}`}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      <div className="creator__canvas-field-drag" {...attributes} {...listeners}>
        <DragHandleIcon style={{ fontSize: 16 }} />
      </div>
      <div className="creator__canvas-field-type-tag">{t(ti?.labelKey, { defaultValue: field.type })}</div>
      {field.abbr
        ? <div className="creator__canvas-field-abbr">{field.abbr}</div>
        : <div className="creator__canvas-field-abbr creator__canvas-field-abbr--empty">{field.label || <em>—</em>}</div>
      }
      {field.abbr && <div className="creator__canvas-field-label">{field.label}</div>}
      {(field.type === 'attr' || field.type === 'number') && (field.min != null || field.max != null) && (
        <div className="creator__canvas-field-range">{field.min ?? '?'} – {field.max ?? '?'}</div>
      )}
      {field.rollable && <div className="creator__canvas-field-roll-badge">⚄</div>}
      {field.showOnShortCard && <div className="creator__canvas-field-short-badge" title={t('creator.showOnShortCard')}>▤</div>}
      {isDuplicateKey && <div className="creator__canvas-field-dupe-warn" title={t('creator.duplicateKeyWarn')}>⚠ dup</div>}
      <div className="creator__canvas-field-actions">
        <button className="creator__canvas-field-action-btn" onClick={e => { e.stopPropagation(); onMoveUp(); }} disabled={isFirst}><ArrowUpwardIcon style={{ fontSize: 11 }} /></button>
        <button className="creator__canvas-field-action-btn" onClick={e => { e.stopPropagation(); onMoveDown(); }} disabled={isLast}><ArrowDownwardIcon style={{ fontSize: 11 }} /></button>
        <button className="creator__canvas-field-action-btn" onClick={e => { e.stopPropagation(); onDuplicate(); }} aria-label={t('creator.fieldDuplicate')}><ContentCopyIcon style={{ fontSize: 11 }} /></button>
        <button className="creator__canvas-field-action-btn creator__canvas-field-action-btn--danger" onClick={e => { e.stopPropagation(); onRemove(); }}><DeleteIcon style={{ fontSize: 11 }} /></button>
      </div>
    </div>
  );
}

// ── SectionCanvas ─────────────────────────────────────────────────────────────

function SectionCanvas({
  id, section, sectionIdx, selected, totalSections,
  onSelectSection, onSelectField,
  onUpdateSection, onRemoveSection, onMoveSection,
  onAddField, onRemoveField, onMoveField, onDuplicateField,
  addingToSection, onToggleAdding,
  duplicateKeys,
}) {
  const { t } = useTranslation();
  const isActiveSection = selected?.sectionIdx === sectionIdx;
  const cols = section.columns || 3;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const dndStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const fieldIds = section.fields.length > 0
    ? section.fields.map(f => f.key)
    : [`__drop__${section.id}`];

  return (
    <div ref={setNodeRef} style={dndStyle} className={`creator__section${isActiveSection ? ' creator__section--active' : ''}`} onClick={() => onSelectSection(sectionIdx)}>
      <div
        className="creator__section-header"
        onClick={() => onSelectSection(sectionIdx)}
      >
        <span className="creator__section-drag" {...attributes} {...listeners}><DragHandleIcon style={{ fontSize: 16 }} /></span>
        <span className="creator__section-title-label">
          {section.title || <em style={{ opacity: 0.45 }}>{t('creator.sectionNoName')}</em>}
        </span>
        <span className="creator__section-cols-badge">{cols} {t('creator.colSuffix')}</span>
        <div className="creator__section-actions">
          <button
            className="creator__section-action-btn"
            onClick={e => { e.stopPropagation(); onMoveSection(sectionIdx, -1); }}
            disabled={sectionIdx === 0}
            title={t('creator.sectionMoveUpShort')}
          >
            <ArrowUpwardIcon style={{ fontSize: 13 }} />
          </button>
          <button
            className="creator__section-action-btn"
            onClick={e => { e.stopPropagation(); onMoveSection(sectionIdx, +1); }}
            disabled={sectionIdx === totalSections - 1}
            title={t('creator.sectionMoveDownShort')}
          >
            <ArrowDownwardIcon style={{ fontSize: 13 }} />
          </button>
          <button
            className="creator__section-action-btn"
            onClick={e => { e.stopPropagation(); onSelectSection(sectionIdx); }}
            title={t('creator.sectionEdit')}
          >
            <ViewColumnIcon style={{ fontSize: 13 }} />
          </button>
          <button
            className="creator__section-action-btn creator__section-action-btn--danger"
            onClick={e => { e.stopPropagation(); onRemoveSection(sectionIdx); }}
            title={t('creator.sectionDelete')}
          >
            <DeleteIcon style={{ fontSize: 13 }} />
          </button>
        </div>
      </div>

      <div className="creator__section-body">
        <SortableContext items={fieldIds} strategy={rectSortingStrategy}>
          <div className={`creator__fields-grid creator__fields-grid--${cols}`}>
            {section.fields.length > 0
              ? section.fields.map((field, fieldIdx) => (
                  <FieldCard
                    key={field.key}
                    id={field.key}
                    field={field}
                    isSelected={selected?.sectionIdx === sectionIdx && selected?.fieldIdx === fieldIdx}
                    isDuplicateKey={duplicateKeys?.has(field.key)}
                    onClick={() => onSelectField(sectionIdx, fieldIdx)}
                    onRemove={() => onRemoveField(sectionIdx, fieldIdx)}
                    onDuplicate={() => onDuplicateField(sectionIdx, fieldIdx)}
                    onMoveUp={() => onMoveField(sectionIdx, fieldIdx, -1)}
                    onMoveDown={() => onMoveField(sectionIdx, fieldIdx, +1)}
                    isFirst={fieldIdx === 0}
                    isLast={fieldIdx === section.fields.length - 1}
                  />
                ))
              : <EmptyDropZone sectionId={section.id} />
            }
            {addingToSection !== sectionIdx && (
              <button
                className="creator__add-field-btn"
                onClick={() => onToggleAdding(sectionIdx)}
              >
                <AddIcon style={{ fontSize: 14 }} /> {t('creator.addField')}
              </button>
            )}
          </div>
        </SortableContext>

        {addingToSection === sectionIdx && (
          <div className="creator__inline-picker">
            {FIELD_TYPES.map(ft => (
              <button
                key={ft.type}
                className="creator__inline-type-btn"
                onClick={() => onAddField(sectionIdx, ft.type)}
              >
                <span className="creator__inline-type-icon">{ft.icon}</span>
                <span>{t(ft.labelKey, { defaultValue: ft.type })}</span>
              </button>
            ))}
            <button className="creator__inline-cancel" onClick={() => onToggleAdding(null)}>✕</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── EmptyDropZone ─────────────────────────────────────────────────────────────

function EmptyDropZone({ sectionId }) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useSortable({ id: `__drop__${sectionId}` });
  return (
    <div ref={setNodeRef} className={`creator__empty-drop-zone${isOver ? ' creator__empty-drop-zone--over' : ''}`}>
      {t('creator.dropZone')}
    </div>
  );
}

// ── TemplatePreview ───────────────────────────────────────────────────────────

function TemplatePreview({ sections, name }) {
  const { t } = useTranslation();
  if (sections.length === 0) {
    return (
      <div className="creator__preview">
        <div className="creator__prev-empty">
          {t('creator.previewNoSections')}
        </div>
      </div>
    );
  }

  return (
    <div className="creator__preview">
      <div className="creator__prev-sheet">
        <div className="creator__prev-sheet-top" />
        <div className="creator__prev-sheet-header">
          <div className="creator__prev-system-name">{name || t('creator.previewDefaultName')}</div>
          <div className="creator__prev-system-label">{t('creator.previewSubtitle')}</div>
        </div>
        <div className="creator__prev-body">
          <CustomSheetBody sections={sections} />
        </div>
      </div>
    </div>
  );
}

// ── TemplateBuilder (main) ────────────────────────────────────────────────────

function findDuplicateKeys(sections) {
  const seen = {};
  const dupes = new Set();
  for (const section of sections) {
    for (const field of section.fields) {
      if (seen[field.key]) dupes.add(field.key);
      else seen[field.key] = true;
    }
  }
  return dupes;
}

function TemplateBuilder({ template, token, onClose, onTemplateUpdated }) {
  const { t } = useTranslation();
  const [sections,    setSections]    = useState(template?.sections || []);
  const [name,        setName]        = useState(template?.name     || '');
  const [settings,    setSettings]    = useState(template?.settings || { diceButtons: [] });
  const [isPublic,    setIsPublic]    = useState(template?.isPublic || false);
  const [selected,    setSelected]    = useState(null); // { sectionIdx, fieldIdx: number|null }
  const [addingToSection, setAddingToSection] = useState(null); // sectionIdx | null
  const [isSaving,    setIsSaving]    = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab,   setActiveTab]   = useState('general');
  const [duplicateKeys, setDuplicateKeys] = useState(new Set());
  // Named variants of hardcoded systems (baseSystem set) carry the sheet from the Go
  // plugin, not GM-authored Sections — so only the General tab (token display / dice /
  // visibility) is editable; hide the Fields and Preview tabs entirely.
  const isVariant = !!template?.baseSystem;
  const saveTimer = useRef(null);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const isPublicRef = useRef(isPublic);
  isPublicRef.current = isPublic;
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    setSections(template?.sections || []);
    setName(template?.name || '');
    setSettings(template?.settings || { diceButtons: [] });
    setIsPublic(template?.isPublic || false);
    setSelected(null);
    setAddingToSection(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);

  const saveTemplate = useCallback(async (currentSections, currentName) => {
    if (!template?.id) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${getApiUrl()}/templates/${template.id}`, {
        method: 'PATCH',
        headers: getApiHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }),
        body: JSON.stringify({ name: currentName, sections: currentSections, settings: settingsRef.current, isPublic: isPublicRef.current }),
      });
      if (!res.ok) throw new Error('Save failed');
      const updated = await res.json();
      onTemplateUpdated?.(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch { /* silent */ } finally {
      setIsSaving(false);
    }
  }, [template?.id, token, onTemplateUpdated]);

  const triggerSave = useCallback((s, n) => {
    setDuplicateKeys(findDuplicateKeys(s));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveTemplate(s, n), 1200);
  }, [saveTemplate]);

  // Flush any pending debounced save BEFORE closing. The in-game close path
  // (GeneralTab.closeTokenConfig) immediately re-syncs this template into the running
  // game, so if the debounced PUT hasn't landed yet the game would embed a stale copy
  // (e.g. a just-bound HP bar goes missing). Awaiting the save here fixes that race.
  const handleClose = useCallback(async () => {
    clearTimeout(saveTimer.current);
    try { await saveTemplate(sectionsRef.current, nameRef.current); } catch { /* ignore */ }
    onClose?.();
  }, [saveTemplate, onClose]);

  // ── Section operations ─────────────────────────────────────────────────────

  const addSection = () => {
    const newSection = makeDefaultSection();
    const next = [...sections, newSection];
    setSections(next);
    setSelected({ sectionIdx: next.length - 1, fieldIdx: null });
    triggerSave(next, name);
  };

  const updateSection = (idx, patch) => {
    const next = sections.map((s, i) => i === idx ? { ...s, ...patch } : s);
    setSections(next);
    triggerSave(next, name);
  };

  const removeSection = (idx) => {
    const next = sections.filter((_, i) => i !== idx);
    setSections(next);
    setSelected(null);
    triggerSave(next, name);
  };

  const moveSection = (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[idx], next[target]] = [next[target], next[idx]];
    setSections(next);
    setSelected({ sectionIdx: target, fieldIdx: null });
    triggerSave(next, name);
  };

  // ── Field operations ───────────────────────────────────────────────────────

  const addField = (sectionIdx, type) => {
    const field = makeDefaultField(type);
    const next = sections.map((s, i) =>
      i === sectionIdx ? { ...s, fields: [...s.fields, field] } : s
    );
    setSections(next);
    setSelected({ sectionIdx, fieldIdx: next[sectionIdx].fields.length - 1 });
    setAddingToSection(null);
    triggerSave(next, name);
  };

  const updateField = (sectionIdx, fieldIdx, patch) => {
    const next = sections.map((s, si) =>
      si === sectionIdx
        ? { ...s, fields: s.fields.map((f, fi) => fi === fieldIdx ? { ...f, ...patch } : f) }
        : s
    );
    setSections(next);
    triggerSave(next, name);
  };

  const removeField = (sectionIdx, fieldIdx) => {
    const next = sections.map((s, si) =>
      si === sectionIdx ? { ...s, fields: s.fields.filter((_, fi) => fi !== fieldIdx) } : s
    );
    setSections(next);
    if (selected?.sectionIdx === sectionIdx && selected?.fieldIdx === fieldIdx) {
      setSelected({ sectionIdx, fieldIdx: null });
    }
    triggerSave(next, name);
  };

  const moveField = (sectionIdx, fieldIdx, dir) => {
    const target = fieldIdx + dir;
    const s = sections[sectionIdx];
    if (target < 0 || target >= s.fields.length) return;
    const newFields = [...s.fields];
    [newFields[fieldIdx], newFields[target]] = [newFields[target], newFields[fieldIdx]];
    const next = sections.map((sec, si) => si === sectionIdx ? { ...sec, fields: newFields } : sec);
    setSections(next);
    setSelected({ sectionIdx, fieldIdx: target });
    triggerSave(next, name);
  };

  const duplicateField = (sectionIdx, fieldIdx) => {
    const source = sections[sectionIdx]?.fields?.[fieldIdx];
    if (!source) return;
    const next = duplicateFieldInSections(sections, sectionIdx, fieldIdx, {
      newKey: genId(source.type),
      copySuffix: t('creator.copySuffix'),
    });
    setSections(next);
    // The insert shifts every field behind the original by one, so the stored fieldIdx
    // would start pointing at the neighbour. Keep the panel on the same field.
    if (selected?.sectionIdx === sectionIdx && selected?.fieldIdx > fieldIdx) {
      setSelected({ sectionIdx, fieldIdx: selected.fieldIdx + 1 });
    }
    triggerSave(next, name);
  };

  const setNameAndSave = (newName) => {
    setName(newName);
    triggerSave(sections, newName);
  };

  const updateSettings = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    settingsRef.current = next; // sync so the debounced save reads fresh settings
    triggerSave(sections, name);
  };

  const setPublicAndSave = (value) => {
    setIsPublic(value);
    isPublicRef.current = value; // sync so the debounced save reads the fresh value
    triggerSave(sections, name);
  };

  // ── DnD ───────────────────────────────────────────────────────────────────

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const originalSectionsRef = useRef(null);

  const collisionDetection = useCallback((args) => {
    const activeId = String(args.active.id);
    const cur = sectionsRef.current;
    const isSection = cur.some(s => s.id === activeId);
    if (isSection) {
      const filtered = args.droppableContainers.filter(c => cur.some(s => s.id === String(c.id)));
      return closestCenter({ ...args, droppableContainers: filtered });
    }
    // fields: exclude section IDs, include field keys + __drop__ sentinels
    const sectionIds = new Set(cur.map(s => s.id));
    const filtered = args.droppableContainers.filter(c => !sectionIds.has(String(c.id)));
    return closestCenter({ ...args, droppableContainers: filtered });
  }, []);

  const handleDragStart = () => {
    originalSectionsRef.current = sectionsRef.current;
    clearTimeout(saveTimer.current);
  };

  const handleDragCancel = () => {
    if (originalSectionsRef.current) setSections(originalSectionsRef.current);
    originalSectionsRef.current = null;
  };

  const handleDragOver = ({ active, over }) => {
    if (!over) return;
    const activeId = String(active.id);
    const overId   = String(over.id);
    const cur = sectionsRef.current;

    if (cur.some(s => s.id === activeId)) return; // section drag, ignore

    const sourceSI = cur.findIndex(s => s.fields.some(f => f.key === activeId));
    if (sourceSI === -1) return;

    let targetSI, insertIdx;
    if (overId.startsWith('__drop__')) {
      const targetSectionId = overId.slice('__drop__'.length);
      targetSI = cur.findIndex(s => s.id === targetSectionId);
      insertIdx = 0;
    } else {
      targetSI = cur.findIndex(s => s.fields.some(f => f.key === overId));
      if (targetSI === -1) return;
      insertIdx = cur[targetSI].fields.findIndex(f => f.key === overId);
    }

    if (sourceSI === targetSI) return; // same section, SortableContext handles it

    const field = cur[sourceSI].fields.find(f => f.key === activeId);
    const finalIdx = insertIdx !== -1 ? insertIdx : cur[targetSI].fields.length;

    const next = cur.map((s, i) => {
      if (i === sourceSI) return { ...s, fields: s.fields.filter(f => f.key !== activeId) };
      if (i === targetSI) {
        const nf = [...s.fields];
        nf.splice(finalIdx, 0, field);
        return { ...s, fields: nf };
      }
      return s;
    });
    sectionsRef.current = next; // sync — blokuje kolejne wywołania handleDragOver zanim React przerenderuje
    setSections(next);
  };

  const handleDragEnd = ({ active, over }) => {
    originalSectionsRef.current = null;
    const cur = sectionsRef.current;

    if (!over || active.id === over.id) {
      triggerSave(cur, name);
      return;
    }
    const activeId = String(active.id);
    const overId   = String(over.id);

    // Section reorder
    if (cur.some(s => s.id === activeId)) {
      const oldIdx = cur.findIndex(s => s.id === activeId);
      const newIdx = cur.findIndex(s => s.id === overId);
      if (oldIdx === newIdx || newIdx === -1) { triggerSave(cur, name); return; }
      const next = arrayMove(cur, oldIdx, newIdx);
      setSections(next);
      if (selected !== null) {
        const movedId = cur[selected.sectionIdx]?.id;
        const newSI = next.findIndex(s => s.id === movedId);
        setSelected(prev => ({ ...prev, sectionIdx: newSI !== -1 ? newSI : 0 }));
      }
      triggerSave(next, name);
      return;
    }

    // Field: cross-section already handled in onDragOver; handle same-section reorder
    const sourceSI = cur.findIndex(s => s.fields.some(f => f.key === activeId));
    const overSI   = cur.findIndex(s => s.fields.some(f => f.key === overId));

    if (sourceSI !== overSI || sourceSI === -1) {
      // cross-section: update selected to reflect new position
      if (selected !== null) {
        const newSI = cur.findIndex(s => s.fields.some(f => f.key === activeId));
        if (newSI !== -1) {
          const newFI = cur[newSI].fields.findIndex(f => f.key === activeId);
          setSelected({ sectionIdx: newSI, fieldIdx: newFI !== -1 ? newFI : null });
        }
      }
      triggerSave(cur, name);
      return;
    }

    const s = cur[sourceSI];
    const oldIdx = s.fields.findIndex(f => f.key === activeId);
    const newIdx = s.fields.findIndex(f => f.key === overId);
    if (oldIdx === newIdx || oldIdx === -1 || newIdx === -1) { triggerSave(cur, name); return; }

    const newFields = arrayMove(s.fields, oldIdx, newIdx);
    const next = cur.map((sec, i) => i === sourceSI ? { ...sec, fields: newFields } : sec);
    setSections(next);
    if (selected?.sectionIdx === sourceSI && selected?.fieldIdx !== null) {
      const movedKey = s.fields[selected.fieldIdx]?.key;
      const newFI = newFields.findIndex(f => f.key === movedKey);
      setSelected({ sectionIdx: sourceSI, fieldIdx: newFI !== -1 ? newFI : null });
    }
    triggerSave(next, name);
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const [paletteTooltip, setPaletteTooltip] = useState(null);
  const paletteTooltipTimer = useRef(null);

  const showPaletteTooltip = (text, el) => {
    clearTimeout(paletteTooltipTimer.current);
    paletteTooltipTimer.current = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      setPaletteTooltip({ top: rect.top + rect.height / 2, left: rect.right, text });
    }, 300);
  };

  const hidePaletteTooltip = () => {
    clearTimeout(paletteTooltipTimer.current);
    setPaletteTooltip(null);
  };

  const numberFields = sections.flatMap(s => s.fields).filter(f => f.type === 'attr');
  const selectedSection = selected !== null ? sections[selected.sectionIdx] : null;
  const selectedField   = selectedSection && selected.fieldIdx !== null
    ? selectedSection.fields[selected.fieldIdx]
    : null;

  const totalFieldCount = sections.reduce((acc, s) => acc + s.fields.length, 0);

  return (
    <Dialog open fullScreen onClose={handleClose}
      PaperProps={{ sx: { background: 'linear-gradient(160deg, #f4e8d8 0%, #ede0ce 100%)' } }}>

      {/* Top bar */}
      <DialogTitle sx={{ p: 0, borderBottom: '2px solid', borderColor: 'primary.light' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', px: 3, py: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <TextField
              variant="standard"
              value={name}
              onChange={e => setNameAndSave(e.target.value)}
              placeholder={t('creator.templateName')}
              InputProps={{ disableUnderline: false, sx: { fontFamily: 'Cinzel, serif', fontSize: '1.1rem', fontWeight: 700, color: 'primary.main' } }}
              sx={{ maxWidth: 320 }}
            />
          </Box>
          <nav className="creator__tab-nav">
            <button
              className={`creator__tab${activeTab === 'general' ? ' creator__tab--active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              <span className="creator__tab-num">1</span>
              {t('creator.tabGeneral')}
            </button>
            {!isVariant && (
              <>
                <span className="creator__tab-arrow">›</span>
                <button
                  className={`creator__tab${activeTab === 'fields' ? ' creator__tab--active' : ''}`}
                  onClick={() => setActiveTab('fields')}
                >
                  <span className="creator__tab-num">2</span>
                  {t('creator.tabFields')}
                </button>
                <span className="creator__tab-arrow">›</span>
                <button
                  className={`creator__tab${activeTab === 'preview' ? ' creator__tab--active' : ''}`}
                  onClick={() => setActiveTab('preview')}
                >
                  <span className="creator__tab-num">3</span>
                  {t('creator.tabPreview')}
                </button>
              </>
            )}
          </nav>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'Crimson Text, serif' }}>
              {sections.length} {t('creator.sections')} · {totalFieldCount} {t('creator.fields')}
            </Typography>
            {isSaving
              ? <HourglassEmptyIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
              : saveSuccess
              ? <Chip icon={<CheckIcon />} label={t('common.saved')} size="small" color="success" variant="outlined" sx={{ fontFamily: 'Crimson Text, serif' }} />
              : null}
            <IconButton onClick={handleClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden' }}>
        {activeTab === 'general' ? (
          <div className="creator__general">
            {/* Visibility (public/private) is meaningless for a hardcoded-system token
                config: it is a private per-user singleton, never shared. Only custom
                templates expose it. */}
            {!isVariant && (
            <div className="creator__settings-card">
              <div className="creator__settings-card-header">
                <span className="creator__settings-card-title">{t('creator.general.visibilityTitle')}</span>
                <span className="creator__settings-card-hint">{t('creator.general.visibilityHint')}</span>
              </div>
              <div className="creator__settings-card-body">
                <FormControlLabel
                  control={<Switch checked={isPublic} onChange={e => setPublicAndSave(e.target.checked)} />}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {isPublic
                        ? <PublicIcon sx={{ fontSize: 18, color: '#c9975b' }} />
                        : <LockIcon sx={{ fontSize: 18, color: '#7a5c42' }} />}
                      <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.95rem', color: '#3a2f1f' }}>
                        {t('creator.general.makePublic')}
                      </Typography>
                    </Box>
                  }
                />
                <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem', color: 'text.secondary', mt: 0.5, ml: 0.5 }}>
                  {isPublic ? t('creator.general.publicDesc') : t('creator.general.privateDesc')}
                </Typography>
              </div>
            </div>
            )}
            <div className="creator__settings-card">
              <div className="creator__settings-card-header">
                <span className="creator__settings-card-title">{t('creator.general.diceTitle')}</span>
                <span className="creator__settings-card-hint">{t('creator.general.diceHint')}</span>
              </div>
              <div className="creator__settings-card-body">
                <DiceConfigBuilder
                  dice={settings.diceButtons || []}
                  onChange={d => updateSettings({ diceButtons: d })}
                />
              </div>
            </div>
            <div className="creator__settings-card">
              <div className="creator__settings-card-header">
                <span className="creator__settings-card-title">{t('creator.tokenDisplay.cardTitle')}</span>
                <span className="creator__settings-card-hint">{t('creator.tokenDisplay.cardHint')}</span>
              </div>
              <div className="creator__settings-card-body">
                <TokenDisplayBuilder
                  value={settings.tokenDisplay}
                  onChange={cfg => updateSettings({ tokenDisplay: cfg })}
                  baseSystem={template?.baseSystem}
                  sections={sections}
                  token={token}
                />
              </div>
            </div>
          </div>
        ) : activeTab === 'preview' ? <TemplatePreview sections={sections} name={name} /> : <>

        {/* Left: palette */}
        <aside className="creator__palette">
          <div className="creator__palette-header">
            <div className="creator__palette-title">{t('creator.components')}</div>
            {selected !== null ? (
              <div className="creator__palette-hint">
                → {sections[selected.sectionIdx]?.title || t('creator.sectionUnnamed')}
              </div>
            ) : sections.length > 0 ? (
              <div className="creator__palette-hint creator__palette-hint--warn">
                {t('creator.paletteSelectSection')}
              </div>
            ) : null}
          </div>
          <div className="creator__palette-scroll">
            {PALETTE_GROUPS.map(group => {
              const groupTypes = FIELD_TYPES.filter(ft => group.types.includes(ft.type));
              return (
                <div key={group.labelKey} className="creator__palette-group">
                  <div className="creator__palette-group-label">{t(group.labelKey)}</div>
                  {groupTypes.map(ft => (
                    <button
                      key={ft.type}
                      className="creator__palette-card"
                      onMouseEnter={e => showPaletteTooltip(t(ft.desc, { defaultValue: ft.type }), e.currentTarget)}
                      onMouseLeave={hidePaletteTooltip}
                      onClick={() => {
                        if (selected !== null) {
                          addField(selected.sectionIdx, ft.type);
                        } else if (sections.length > 0) {
                          addField(sections.length - 1, ft.type);
                        } else {
                          const newSection = makeDefaultSection();
                          const next = [newSection];
                          setSections(next);
                          setSelected({ sectionIdx: 0, fieldIdx: null });
                          triggerSave(next, name);
                        }
                      }}
                    >
                      <span className="creator__palette-icon">{ft.icon}</span>
                      <div className="creator__palette-info">
                        <div className="creator__palette-name">{t(ft.labelKey, { defaultValue: ft.type })}</div>
                        <div className="creator__palette-desc">{t(ft.desc, { defaultValue: '' })}</div>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center: canvas */}
        <main className="creator__canvas-area" onClick={() => { setSelected(null); setAddingToSection(null); }}>
          {sections.length === 0 ? (
            <div className="creator__canvas-empty">
              <AccountTreeIcon sx={{ fontSize: 48, opacity: 0.2, mb: 1, color: '#7a5c42' }} />
              <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '1.1rem', fontStyle: 'italic', opacity: 0.5, color: '#3d2b1a' }}>
                {t('creator.canvasStart')}
              </Typography>
              <button className="creator__add-section-btn" style={{ marginTop: 24 }} onClick={e => { e.stopPropagation(); addSection(); }}>
                <AddIcon style={{ fontSize: 16 }} /> {t('creator.addSection')}
              </button>
            </div>
          ) : (
            <div onClick={e => e.stopPropagation()}>
              <DndKitContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
                <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  {sections.map((section, sectionIdx) => (
                    <SectionCanvas
                      key={section.id}
                      id={section.id}
                      section={section}
                      sectionIdx={sectionIdx}
                      selected={selected}
                      totalSections={sections.length}
                      onSelectSection={idx => setSelected({ sectionIdx: idx, fieldIdx: null })}
                      onSelectField={(si, fi) => setSelected({ sectionIdx: si, fieldIdx: fi })}
                      onUpdateSection={updateSection}
                      onRemoveSection={removeSection}
                      onMoveSection={moveSection}
                      onAddField={addField}
                      onRemoveField={removeField}
                      onMoveField={moveField}
                      onDuplicateField={duplicateField}
                      addingToSection={addingToSection}
                      onToggleAdding={idx => setAddingToSection(prev => prev === idx ? null : idx)}
                      duplicateKeys={duplicateKeys}
                    />
                  ))}
                </SortableContext>
              </DndKitContext>
              <button className="creator__add-section-btn" onClick={addSection}>
                <AddIcon style={{ fontSize: 16 }} /> {t('creator.addSection')}
              </button>
            </div>
          )}
        </main>

        {/* Right: properties */}
        <aside className="creator__props-aside">
          {selectedField ? (
            <PropertyPanel
              field={selectedField}
              onChange={patch => updateField(selected.sectionIdx, selected.fieldIdx, patch)}
              numberFields={numberFields}
              sections={sections}
            />
          ) : selectedSection ? (
            <SectionPropertyPanel
              section={selectedSection}
              onChange={patch => updateSection(selected.sectionIdx, patch)}
              onDelete={() => removeSection(selected.sectionIdx)}
              sectionIdx={selected.sectionIdx}
              totalSections={sections.length}
              onMove={moveSection}
            />
          ) : (
            <div className="creator__props-empty">
              <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', textAlign: 'center' }}>
                {t('creator.propsClickHint')}
              </Typography>
            </div>
          )}
        </aside>

        </>}
      </DialogContent>

      {paletteTooltip && createPortal(
        <div
          className="portal-tooltip portal-tooltip--right"
          style={{ top: paletteTooltip.top, left: paletteTooltip.left }}
        >
          {paletteTooltip.text}
          <span className="portal-tooltip__arrow" />
        </div>,
        document.body
      )}
    </Dialog>
  );
}

export default TemplateBuilder;
