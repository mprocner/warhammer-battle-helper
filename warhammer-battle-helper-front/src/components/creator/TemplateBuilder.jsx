import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable,
} from '@dnd-kit/core';
import {
  Dialog, DialogTitle, DialogContent, IconButton, Typography, Box,
  TextField, Switch, FormControlLabel, Select, MenuItem, InputLabel,
  FormControl, Divider, Chip, Slider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import NumbersIcon from '@mui/icons-material/Numbers';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ShortTextIcon from '@mui/icons-material/ShortText';
import SubjectIcon from '@mui/icons-material/Subject';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import ListIcon from '@mui/icons-material/List';
import TableRowsIcon from '@mui/icons-material/TableRows';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import GavelIcon from '@mui/icons-material/Gavel';
import LabelIcon from '@mui/icons-material/Label';
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { collectSkillOptions, renderDamageFormula } from '../../systems/custom/CustomSheetBody';
import CustomSheetBody from '../../systems/custom/CustomSheetBody';
import PropertyPopup from './PropertyPopup';
import FieldChrome from './FieldChrome';
import SectionChrome from './SectionChrome';
import EditablePlaceholder from './EditablePlaceholder';
import FormulaBuilder from './FormulaBuilder';
import DiceConfigBuilder from './DiceConfigBuilder';
import ModifierConfigBuilder from './ModifierConfigBuilder';
import TokenDisplayBuilder from './TokenDisplayBuilder';
import {
  SECTION_TYPE, sectionOf, nodeAt, locate, childrenOf, samePath,
  updateAtPath, insertAtPath, removeAtPath, duplicateNodeAtPath, walkFields,
  containerPathFor, shiftPathAfterInsert, shiftPathAfterRemoval,
  moveNode, canDropInto, nodeId, isAncestorPath, indexNodes, isContainer,
} from '../../utils/templateSections';
import { measureNodes, insertionAt, toMoveArgs, ghostRectFor } from '../../utils/sheetDnd';
import { SHEET_WIDTH_MIN, SHEET_WIDTH_MAX, SHEET_WIDTH_STEP, clampSheetWidth } from '../../utils/sheetWidth';

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

// Skill-tree node removal. Named apart from the template tree's removeAtPath (imported from
// utils/templateSections) because they walk different shapes: children[] vs fields[].
function removeTreeAtPath(node, path) {
  if (path.length === 1) {
    return { ...node, children: node.children.filter((_, i) => i !== path[0]) };
  }
  const idx = path[0];
  return { ...node, children: node.children.map((c, i) => i === idx ? removeTreeAtPath(c, path.slice(1)) : c) };
}

// ── field type config ─────────────────────────────────────────────────────────

const FIELD_TYPES = [
  { type: 'section',     labelKey: 'creator.fieldType.section',     icon: <ViewQuiltIcon fontSize="small" />,  desc: 'creator.fieldType.sectionDesc' },
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
  { type: 'label',         labelKey: 'creator.fieldType.label',         icon: <LabelIcon fontSize="small" />,       desc: 'creator.fieldType.labelDesc' },
];

// Skróconą kartę renderują tylko te trzy typy pól (BUG-176).
const SHORT_CARD_FIELD_TYPES = ['attr', 'number', 'progress'];

const PALETTE_GROUPS = [
  { labelKey: 'creator.paletteGroupLayout',  types: ['section'] },
  { labelKey: 'creator.paletteGroupStats',   types: ['attr', 'number', 'progress'] },
  { labelKey: 'creator.paletteGroupText',    types: ['text_short', 'text_long', 'label'] },
  { labelKey: 'creator.paletteGroupChoice',  types: ['checkbox', 'select'] },
  { labelKey: 'creator.paletteGroupTables',  types: ['skill_table', 'weapons_table', 'skill_tree'] },
];

// Label colours (FEATURE-156). A fixed set, not a free colour picker: the character sheet sits on a
// light cream background, so an unrestricted picker lets a GM choose white and make the text vanish.
// The hex is what gets stored — not an index — so reordering this list never repaints existing templates.
const LABEL_COLORS = ['#3a2f1f', '#7a5c42', '#c9975b', '#8b2c2c', '#3f6b3f', '#2f4a6b', '#5c3a6b', '#4a4a4a'];

function makeDefaultField(type) {
  const base = {
    key: genId(type),
    type,
    label: '',
    abbr: '',
    rollable: false,
  };
  if (type === 'attr') return { ...base, min: 0, max: 100, step: 1, showOnShortCard: false, hasAdvances: false, advancesLabel: 'Rozwinięcie' };
  if (type === 'number') return { ...base, min: 0, max: 100, step: 1, showOnShortCard: false };
  if (type === 'progress') return { ...base, showOnShortCard: true };
  if (type === 'select') return { ...base, options: [] };
  if (type === 'skill_table') return { ...base, skills: [], rollable: true, assignAttrToSkill: false, hasAdvances: false, advancesLabel: 'Rozwinięcie' };
  if (type === 'weapons_table') return { ...base, columns: [], rollable: true, rollConfig: defaultRollConfig(), damageFormula: [], presetWeapons: [] };
  if (type === 'skill_tree') return { ...base, tree: { key: genId('tree'), label: 'Kategoria', children: [] }, playerCanAddSkills: false, assignAttrToSkill: false };
  if (type === 'label') return { ...base, text: '', textColor: '', textSize: 'normal' };
  // A section field wraps a whole SectionDef. section.id mirrors the field key so DnD,
  // selection and React keys all address the node by one value.
  if (type === 'section') return { ...base, section: { id: base.key, title: '', columns: 3, fields: [] } };
  return base;
}

function makeDefaultSection() {
  return { id: genId('section'), title: '', columns: 3, fields: [] };
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
                onChange(removeTreeAtPath(tree, path));
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

// ── WeaponPresetsEditor ──────────────────────────────────────────────────────

// GM editor for a weapons_table field's preset weapons. Each preset is a "row template":
// the GM fills the same column cells and damage blocks a player would, plus an "always on
// the sheet" switch. AlwaysOn presets are shown read-only on every sheet (a GM edit
// propagates); the rest form a catalog the player can copy into their own editable rows.
// Inlined into the Content group of the field property panel, right below the weapon
// columns editor — a preset is filled in per column, so the two are read together.
function WeaponPresetsEditor({ field, sections, onChange }) {
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
    <div className="creator__weapon-presets-editor">
      <div className="creator__props-subhead">
        <GavelIcon fontSize="small" />
        {t('creator.weaponPresetsTitle')}
      </div>
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
    </div>
  );
}

// A titled group in the properties panel. Inspector panels live or die on grouping: a flat stack
// of twenty controls forces the GM to read every label to find one, while four labelled groups
// let them jump. The divider is a hairline rather than a box so the groups read as one surface.
function PropsGroup({ title, children }) {
  return (
    <div className="creator__props-group">
      <div className="creator__props-group-title">{title}</div>
      {children}
    </div>
  );
}

// The panel's sticky header: the caption naming what is being edited, plus the field/section
// TYPE so the GM always knows which kind of node they are configuring, even after scrolling
// the controls below it out of view.
function PropsHead({ caption, typeInfo, t }) {
  return (
    <div className="creator__props-head">
      <Typography variant="subtitle2" sx={{ fontFamily: 'Cinzel, serif', color: 'primary.main', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.75rem' }}>
        {caption}
      </Typography>
      {typeInfo && (
        <Typography variant="caption" className="creator__props-head-type">
          {t(typeInfo.labelKey, { defaultValue: typeInfo.type })}
        </Typography>
      )}
    </div>
  );
}

// ── PropertyPanel (field) ────────────────────────────────────────────────────

function PropertyPanel({ field, onChange, onDelete, numberFields, sections }) {
  const { t } = useTranslation();
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
  const typeInfo = FIELD_TYPES.find(ft => ft.type === field.type);

  // Switch rows in this panel put the label on the left and the control on the right — MUI's
  // default FormControlLabel puts the switch first, which wastes width the panel needs.
  const switchRowSx = { ml: 0, mr: 0, width: 1, justifyContent: 'space-between' };

  return (
    <div className="creator__props-panel">
      <PropsHead caption={t('creator.fieldProperties')} typeInfo={typeInfo} t={t} />

      <PropsGroup title={t('creator.propsGroupBasics')}>
        {/* key is an internal, immutable surrogate id (see genId) — never derived from the label,
            so renaming a field never orphans player data stored under it. Not shown to the GM. */}
        {/* A label field renames this input: in Polish creator.fieldLabel reads "Etykieta", the same
            word as the field type itself, so a label's panel would show "Etykieta" inside "Etykieta". */}
        <TextField size="small" fullWidth
          label={field.type === 'label' ? t('creator.labelInternalName') : t('creator.fieldLabel')}
          helperText={field.type === 'label' ? t('creator.labelInternalNameHint') : undefined}
          value={field.label}
          onChange={e => up({ label: e.target.value })}
          sx={{ mb: 1.5 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }} />

        {field.type === 'label' && (
          <>
            <TextField size="small" fullWidth multiline rows={3}
              label={t('creator.labelText')}
              helperText={t('creator.labelTextHint')}
              value={field.text || ''}
              onChange={e => up({ text: e.target.value })}
              sx={{ mb: 1.5 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }} />

            <Typography variant="caption" sx={{ color: 'primary.main', display: 'block', mb: 0.75, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('creator.labelColor')}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
              {LABEL_COLORS.map(hex => (
                <button
                  key={hex}
                  type="button"
                  aria-label={hex}
                  className={`creator__label-swatch${(field.textColor || LABEL_COLORS[0]) === hex ? ' creator__label-swatch--active' : ''}`}
                  style={{ background: hex }}
                  onClick={() => up({ textColor: hex })}
                />
              ))}
            </Box>

            <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
              <InputLabel>{t('creator.labelSize')}</InputLabel>
              <Select
                label={t('creator.labelSize')}
                value={field.textSize || 'normal'}
                onChange={e => up({ textSize: e.target.value })}
              >
                <MenuItem value="small">{t('creator.labelSizeSmall')}</MenuItem>
                <MenuItem value="normal">{t('creator.labelSizeNormal')}</MenuItem>
                <MenuItem value="large">{t('creator.labelSizeLarge')}</MenuItem>
                <MenuItem value="heading">{t('creator.labelSizeHeading')}</MenuItem>
              </Select>
            </FormControl>
          </>
        )}

        {(field.type === 'attr' || field.type === 'number' || field.type === 'progress' || field.type === 'skill_table' || field.type === 'skill_tree') && (
          <TextField size="small" fullWidth label={t('creator.fieldAbbr')} value={field.abbr || ''}
            onChange={e => up({ abbr: e.target.value })}
            helperText={t('creator.fieldAbbrHint')}
            sx={{ mb: 1.5 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }} />
        )}

        {/* Skróconą kartę renderują tylko te trzy typy (BUG-176) — skill_table i skill_tree trafiają
            tam wyłącznie przez gwiazdki gracza, więc flaga byłaby na nich martwa. */}
        {SHORT_CARD_FIELD_TYPES.includes(field.type) && (
          <FormControlLabel
            labelPlacement="start"
            control={<Switch checked={!!field.showOnShortCard} onChange={e => up({ showOnShortCard: e.target.checked })} size="small" />}
            label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t('creator.showOnShortCard')}</Typography>}
            sx={switchRowSx}
          />
        )}
      </PropsGroup>

      {['attr', 'number', 'skill_table'].includes(field.type) && (
        <PropsGroup title={t('creator.propsGroupValues')}>
          {/* type="number" only rejects non-numeric input, not decimals — a value like "2.5" would
              reach the backend as *int and 400 the whole template PATCH. saveTemplate swallows that
              error silently, so every later edit to the template would appear to vanish with no
              visible cause. Truncate to an integer here so that can never happen. */}
          {(field.type === 'attr' || field.type === 'number') && (
            <div className="creator__props-duo" style={{ marginBottom: 10 }}>
              <TextField size="small" label="Min" type="number" value={field.min ?? ''} onChange={e => up({ min: e.target.value === '' ? null : Math.trunc(Number(e.target.value)) })} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' }, inputProps: { step: 1 } }} />
              <TextField size="small" label="Max" type="number" value={field.max ?? ''} onChange={e => up({ max: e.target.value === '' ? null : Math.trunc(Number(e.target.value)) })} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' }, inputProps: { step: 1 } }} />
            </div>
          )}

          {/* Skok steruje wyłącznie strzałkami inputu na karcie. Przeglądarka nie dodaje skoku do
              bieżącej wartości — snapuje ją do siatki stepBase + n * step, gdzie stepBase to atrybut
              min (a bez niego 0). Trunc tak samo obowiązkowy jak wyżej: ułamek 400-uje cały PATCH
              szablonu, a saveTemplate połyka ten błąd po cichu. Floor na 0 (nie na 1!) w onChange —
              autosave odpala się 1200 ms po zmianie (triggerSave), więc bez tego floora ujemny
              skok wpisany i pozostawiony bez blura trafiłby do Mongo na stałe: `Step int` nie ma
              ochrony przed ujemnymi wartościami, tylko `0` jest wycinane przez `omitempty`. Floor
              na 1 tutaj zepsułby pisanie — wpisanie "0" z zamiarem "05" skoczyłoby od razu na 1,
              a kolejny znak dałby "15". `0` jest bezpieczne jako stan przejściowy: karta czyta
              brakujący/zerowy skok jako 1 przez `field.step || 1`. Podniesienie <1 → 1 zostaje na
              onBlur, tak jak wcześniej — floor w onChange jest dodatkową siatką bezpieczeństwa na
              wypadek, gdyby autosave zdążył wystrzelić pierwszy. */}
          {(field.type === 'attr' || field.type === 'number') && (
            <div className="creator__props-duo" style={{ marginBottom: 10 }}>
              <TextField size="small" label={t('creator.fieldDefault')} type="number" value={field.default ?? ''} onChange={e => up({ default: e.target.value === '' ? null : Math.trunc(Number(e.target.value)) })} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' }, inputProps: { step: 1 } }} />
              <TextField
                size="small"
                label={t('creator.fieldStep')}
                helperText={t('creator.fieldStepHint')}
                type="number"
                value={field.step ?? ''}
                onChange={e => up({ step: e.target.value === '' ? null : Math.max(0, Math.trunc(Number(e.target.value))) })}
                onBlur={() => {
                  // Pole sprzed feature'a (undefined) nigdy się nie zapisuje — focus + blur bez edycji
                  // nie może odpalić `up()`, bo to zastępuje cały obiekt pola i planuje PATCH całego
                  // szablonu (BUG scenariusz z finalnego review). Pole zawierające wartość spoza zakresu
                  // (np. z autosave'a) samowylecza się do 1 na blurze.
                  if (field.step === undefined) return;
                  const clamped = field.step == null || field.step < 1 ? 1 : field.step;
                  if (clamped !== field.step) up({ step: clamped });
                }}
                InputProps={{ sx: { fontFamily: 'Crimson Text, serif' }, inputProps: { step: 1, min: 1 } }}
              />
            </div>
          )}

          {field.type === 'attr' && (
            <>
              <FormControlLabel
                labelPlacement="start"
                control={<Switch checked={!!field.hasAdvances} onChange={e => up({ hasAdvances: e.target.checked })} size="small" />}
                label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t('creator.fieldAdvances')}</Typography>}
                sx={switchRowSx}
              />
              {field.hasAdvances && (
                <TextField
                  size="small"
                  fullWidth
                  label={t('creator.fieldAdvancesLabel')}
                  value={field.advancesLabel ?? t('creator.fieldAdvancesDefault')}
                  onChange={e => up({ advancesLabel: e.target.value })}
                  sx={{ mt: 1 }}
                  InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }}
                />
              )}
            </>
          )}

          {field.type === 'skill_table' && (
            <>
              <FormControlLabel
                labelPlacement="start"
                control={<Switch checked={!!field.hasAdvances} onChange={e => up({ hasAdvances: e.target.checked })} size="small" />}
                label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t('creator.fieldAdvances')}</Typography>}
                sx={switchRowSx}
              />
              {field.hasAdvances && (
                <TextField
                  size="small"
                  fullWidth
                  label={t('creator.fieldAdvancesLabel')}
                  value={field.advancesLabel ?? t('creator.fieldAdvancesDefault')}
                  onChange={e => up({ advancesLabel: e.target.value })}
                  sx={{ mt: 1 }}
                  InputProps={{ sx: { fontFamily: 'Crimson Text, serif' } }}
                />
              )}
            </>
          )}
        </PropsGroup>
      )}

      {['select', 'skill_table', 'weapons_table', 'skill_tree'].includes(field.type) && (
        <PropsGroup title={t('creator.propsGroupContent')}>
          {field.type === 'select' && (
            <OptionsEditor
              label={t('creator.selectOptions')}
              options={field.options || []}
              onChange={opts => up({ options: opts })}
            />
          )}

          {(field.type === 'skill_table' || field.type === 'skill_tree') && (
            <FormControlLabel
              labelPlacement="start"
              control={
                <Switch
                  size="small"
                  checked={!!field.assignAttrToSkill}
                  onChange={e => up({ assignAttrToSkill: e.target.checked })}
                />
              }
              label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t('creator.fieldAssignAttr')}</Typography>}
              sx={{ ...switchRowSx, mb: 1 }}
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
              <WeaponPresetsEditor
                field={field}
                sections={sections}
                onChange={presetWeapons => up({ presetWeapons })}
              />
            </>
          )}

          {field.type === 'skill_tree' && (
            <FormControlLabel
              labelPlacement="start"
              control={<Switch checked={!!field.playerCanAddSkills} onChange={e => up({ playerCanAddSkills: e.target.checked })} size="small" />}
              label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t('creator.playerCanAddSkills')}</Typography>}
              sx={switchRowSx}
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
        </PropsGroup>
      )}

      {['attr', 'skill_table', 'skill_tree', 'weapons_table'].includes(field.type) && (
        <PropsGroup title={t('creator.propsGroupRoll')}>
          {(field.type === 'attr' || field.type === 'skill_table' || field.type === 'skill_tree') && (
            <>
              <FormControlLabel
                labelPlacement="start"
                control={<Switch checked={!!field.rollable} onChange={e => up({ rollable: e.target.checked, rollConfig: e.target.checked ? (field.rollConfig || defaultRollConfig()) : null })} size="small" />}
                label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t('creator.rollable')}</Typography>}
                sx={switchRowSx}
              />
              {field.rollable && field.rollConfig && (
                <RollConfigEditor config={field.rollConfig} onChange={cfg => up({ rollConfig: cfg })} numberFields={numberFields} fieldType={field.type} />
              )}
            </>
          )}

          {field.type === 'weapons_table' && (
            <>
              <Typography variant="caption" sx={{ color: 'primary.main', display: 'block', mb: 0.75, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('creator.weaponAttackRoll')}
              </Typography>
              <RollConfigEditor
                config={field.rollConfig || defaultRollConfig()}
                onChange={cfg => up({ rollConfig: cfg })}
                numberFields={numberFields}
                fieldType={field.type}
              />
            </>
          )}
        </PropsGroup>
      )}

      <PropsGroup title={t('creator.propsGroupDanger')}>
        <div className="creator__props-danger">
          <button
            className="creator__section-action-btn creator__section-action-btn--danger"
            onClick={onDelete}
            title={t('creator.fieldDelete')}
          >
            <DeleteIcon style={{ fontSize: 14 }} /> {t('creator.fieldDelete')}
          </button>
        </div>
      </PropsGroup>
    </div>
  );
}

// ── SectionPropertyPanel ─────────────────────────────────────────────────────

function SectionPropertyPanel({ section, onChange, onDelete, index, siblingCount, onMove }) {
  const { t } = useTranslation();
  const typeInfo = FIELD_TYPES.find(ft => ft.type === 'section');
  return (
    <div className="creator__props-panel">
      <PropsHead caption={t('creator.sectionProperties')} typeInfo={typeInfo} t={t} />

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

      <div className="creator__props-danger">
        <Box sx={{ display: 'flex', gap: 1 }}>
          <button className="creator__section-action-btn" onClick={() => onMove(-1)} disabled={index === 0} title={t('creator.sectionMoveUp')}>
            <ArrowUpwardIcon style={{ fontSize: 14 }} />
          </button>
          <button className="creator__section-action-btn" onClick={() => onMove(+1)} disabled={index === siblingCount - 1} title={t('creator.sectionMoveDown')}>
            <ArrowDownwardIcon style={{ fontSize: 14 }} />
          </button>
          <button className="creator__section-action-btn creator__section-action-btn--danger" onClick={onDelete} title={t('creator.sectionDelete')} style={{ marginLeft: 'auto' }}>
            <DeleteIcon style={{ fontSize: 14 }} />
          </button>
        </Box>
      </div>
    </div>
  );
}

// ── TemplateBuilder (main) ────────────────────────────────────────────────────

function findDuplicateKeys(sections) {
  const seen = {};
  const dupes = new Set();
  walkFields(sections, (field) => {
    if (seen[field.key]) dupes.add(field.key);
    else seen[field.key] = true;
  });
  return dupes;
}

// ── Drag-and-drop wiring ─────────────────────────────────────────────────────
//
// resolveContainerEl finds the DOM element a container node should be measured against.
//
// Per measureNodes' own contract, that must be the interior grid (`.custom-sheet__fields--N-col`),
// never the section box: the box adds the heading and its own padding, which would make
// ghostRectFor/isRowLayout think there is more row space than the grid actually has.
//
// An EMPTY section's grid has no children and therefore no height at all — nothing for a pointer
// to land on. EditablePlaceholder already draws a dashed stand-in for exactly that case (the only
// visible surface an empty section offers), so that is what gets measured instead.
function resolveContainerEl(handleEl, isEmpty) {
  const wrapper = handleEl.closest('.custom-sheet__editable');
  if (!wrapper) return null;
  return isEmpty
    ? wrapper.querySelector(':scope > .creator__ph--section')
    : wrapper.querySelector(':scope > .custom-sheet__section > .custom-sheet__fields');
}

// DraggableFieldChrome / DraggableSectionChrome wrap FieldChrome/SectionChrome with the actual
// dnd-kit wiring. They exist as separate components — rather than calling useDraggable directly
// inside buildChrome — because buildChrome runs as a plain function call from CustomSheetBody's
// OWN render (it is handed over as the renderChrome callback, not invoked from TemplateBuilder's
// render), so a hook called inside its body would register against CustomSheetBody's fiber, and
// the hook count there would vary with the number of nodes on the sheet — an immediate "Rendered
// more hooks than during the previous render". FieldChrome/SectionChrome are real components
// (buildChrome returns JSX naming them, not a raw call), so mounting one wrapper component per
// node keeps every hook call inside a stable component instance.
//
// The measurement ref is layered onto dnd-kit's own setNodeRef instead of a second ref prop,
// because FieldChrome/SectionChrome only forward one ref (onto the drag handle) — composing here
// keeps both files untouched.
function DraggableFieldChrome({ path, registerNode, ...rest }) {
  const { setNodeRef, attributes, listeners } = useDraggable({ id: path.join('.') });
  const combinedRef = useCallback((el) => {
    setNodeRef(el);
    // A leaf field's measurable element is the grid cell it occupies — its own
    // `.custom-sheet__editable` wrapper — found by walking up from the drag handle.
    registerNode(path, false, el ? el.closest('.custom-sheet__editable') : null);
  }, [setNodeRef, registerNode, path]);
  return <FieldChrome {...rest} depth={path.length} dragRef={combinedRef} dragProps={{ ...attributes, ...listeners }} />;
}

function DraggableSectionChrome({ path, registerNode, isEmpty, ...rest }) {
  const { setNodeRef, attributes, listeners } = useDraggable({ id: path.join('.') });
  const combinedRef = useCallback((el) => {
    setNodeRef(el);
    registerNode(path, true, el ? resolveContainerEl(el, isEmpty) : null);
  }, [setNodeRef, registerNode, path, isEmpty]);
  return <SectionChrome {...rest} depth={path.length} dragRef={combinedRef} dragProps={{ ...attributes, ...listeners }} />;
}

// buildDragEntries constructs the entries list that measureNodes reads at drag start. The root
// list is prepended here rather than registered like every other node because it has no chrome of
// its own to register it — it is a container of nodes, not a node. Without it insertionAt can
// never answer "between two root sections", so dragging a section to the top level, or
// reordering root sections at all, would be impossible. Pure and exported so that omission is a
// test failure rather than a silent loss.
export function buildDragEntries(rootEl, nodeEntries) {
  return [
    ...(rootEl ? [{ path: [], container: true, el: rootEl }] : []),
    ...nodeEntries,
  ];
}

// resolveDrop is the drag-end decision: given the tree, where the node started and the target
// insertionAt computed, either moveNode's arguments or a refusal. Pulled out of the handler
// (rather than inlined) because jsdom cannot drive a real pointer drag to exercise
// handleDragStart/handleDragMove — no window.PointerEvent, no layout, no elementFromPoint — but
// this decision is plain data in, data out, and can be tested directly.
//
// canDropInto refuses a node's own DIRECT parent as a drop target. That rule serves the older
// hover-based design, where landing on a container's whole (unaddressed) body was ambiguous — the
// explicit "beside a specific sibling" gesture lived elsewhere entirely. insertionAt always hands
// back an explicit index, so reordering within the section a node already lives in carries no such
// ambiguity; only the self/descendant cycle still matters, and moveNode enforces that on its own
// regardless of what canDropInto says. Bypassing canDropInto's extra refusal for that one case is
// what keeps ordinary same-section reordering — the single most common drag — from being silently
// rejected. The bypass can never let a real cycle through: a node's direct parent is, by
// construction, never the node itself nor one of its descendants.
export function resolveDrop(sections, fromPath, target) {
  if (!target || !Array.isArray(fromPath)) return null;
  const toRoot = target.parentPath.length === 0;
  // moveNode silently leaves the tree unchanged when a LEAF field is sent to root (the root
  // list holds SectionDefs, not fields) — refuse it here instead. The ghost is gated on this
  // same result (see ghostRectForDrop below), so a refusal here also means no ghost was ever
  // drawn promising a landing spot that cannot exist.
  if (toRoot && !isContainer(nodeAt(sections, fromPath))) return null;
  const directParent = fromPath.slice(0, -1);
  // The root list has no node of its own for canDropInto to check (nodeAt(sections, []) is
  // null, and canDropInto refuses an empty refPath outright), so it is allowed directly here
  // rather than routed through canDropInto. That is still safe: moveNode enforces the
  // self/descendant cycle guard on its own, and the root list can never be a descendant of the
  // dragged node (isAncestorPath requires the ancestor to be the SHORTER path).
  const allowed = toRoot
    || samePath(target.parentPath, directParent)
    || canDropInto(sections, fromPath, target.parentPath);
  if (!allowed) return null;
  return toMoveArgs(fromPath, target);
}

// ghostRectForDrop is the ghost's gate: it draws nothing for a target resolveDrop would refuse
// (a leaf dropped at root, a node dropped into itself or a descendant), so the preview can never
// promise a landing spot that then does nothing on release. `decision` is resolveDrop's own
// result, computed once — in handleDragMove, where the target itself is set — and handed in
// here rather than recomputed, so this is purely "should THIS decision draw a ghost", not a
// second copy of resolveDrop's rules. Exported so the refusal can be tested without a DOM:
// jsdom cannot drive a real drag, but this is plain data in, data out.
export function ghostRectForDrop(decision, target, draggedRect, nodes) {
  if (!decision) return null;
  return ghostRectFor(target, draggedRect, nodes);
}

// editingPathAfterMove recomputes the open properties popup's path after a successful move, so it
// follows the node it was showing — exactly as moveWithinParent and duplicateNode already do for
// their own edits. Handles both the dragged node itself and any of its descendants (moving a
// section keeps whatever is being edited inside it in place, relative to the section).
export function editingPathAfterMove(editingPath, fromPath, newPath) {
  if (!newPath) return editingPath;
  if (samePath(editingPath, fromPath)) return newPath;
  if (editingPath && isAncestorPath(fromPath, editingPath)) {
    return [...newPath, ...editingPath.slice(fromPath.length)];
  }
  return editingPath;
}

// editingPathAfterRemove recomputes the open properties popup's path after a node is deleted.
// Three outcomes, and shiftPathAfterRemoval only answers the third: the edited node may BE the one
// removed, it may sit inside the removed subtree — in both cases there is nothing left to edit and
// the popup must close — or it may merely sit after it in the same list, where its index moves
// down by one. Leaving it untouched is what makes a stale path point at whichever node slid into
// the gap, which is how the popup silently starts editing the wrong field.
export function editingPathAfterRemove(editingPath, removedPath) {
  if (!editingPath) return null;
  if (samePath(editingPath, removedPath)) return null;
  if (isAncestorPath(removedPath, editingPath)) return null;
  return shiftPathAfterRemoval(editingPath, removedPath);
}

function TemplateBuilder({ template, token, onClose, onTemplateUpdated }) {
  const { t } = useTranslation();
  const [sections,    setSections]    = useState(template?.sections || []);
  const [name,        setName]        = useState(template?.name     || '');
  const [settings,    setSettings]    = useState(template?.settings || { diceButtons: [] });
  const [isPublic,    setIsPublic]    = useState(template?.isPublic || false);
  // selected is a PATH: [2] = third root section, [2,0] = its first child (field or
  // subsection), [2,0,1] = a child of that subsection. null = nothing selected.
  const [selected,    setSelected]    = useState(null);
  // Selection and properties are deliberately separate. A click selects (it makes the node the
  // palette's target and outlines it); only the chrome's edit button opens properties. Were
  // selection to open the popup, the dominant flow — select a section, then click the palette a
  // few times to add fields — would keep the popup hanging over the very sheet being built.
  const [editingPath, setEditingPath] = useState(null);
  const [addingToPath, setAddingToPath] = useState(null); // path of the section whose "add field" list is open
  const [isSaving,    setIsSaving]    = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab,   setActiveTab]   = useState('general');
  const [duplicateKeys, setDuplicateKeys] = useState(new Set());
  // Toggles renderChrome off so the sheet tab shows exactly what a player would see — the
  // top-bar eye icon, not a third tab (there is nothing else to show alongside it).
  const [cleanPreview, setCleanPreview] = useState(false);
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

  // ── Drag-and-drop state ─────────────────────────────────────────────────────
  //
  // path -> element, filled by the chrome layer as each node mounts (DraggableFieldChrome /
  // DraggableSectionChrome). This is the only DOM the drag system touches, and it is read
  // exactly once per drag, in handleDragStart — the sheet's layout never changes mid-drag, so
  // reading it again would only cost work and reopen the geometry/decision feedback loop the
  // out-of-flow ghost exists to avoid.
  const nodeEls = useRef(new Map());
  const registerNode = useCallback((path, container, el) => {
    const key = path.join('.');
    if (el) nodeEls.current.set(key, { path, container, el });
    else nodeEls.current.delete(key);
  }, []);

  // scrollRef is the sheet's own scroll container (creator__sheet-area). Rects are captured in
  // viewport coordinates at drag start; scrolling during the drag moves every one of them by the
  // same amount, and with a single droppable dnd-kit no longer corrects for that on its own.
  const scrollRef = useRef(null);

  // sheetWrapperRef is the `.custom-sheet` wrapper TemplateBuilder itself mounts around
  // CustomSheetBody. The root list's actual element (`.custom-sheet__sections`) is queried from
  // it at drag start rather than threaded through as its own ref, because CustomSheetBody owns
  // that markup — its shape is guarded by a characterization snapshot the creator must not touch.
  const sheetWrapperRef = useRef(null);

  // { fromPath, rects, draggedRect, target, decision, scrolled, scrollTop0 } while a drag is in
  // progress, else null. `decision` is resolveDrop's result for the current target (null when
  // refused); `scrolled` is the scroll delta since drag start, used to keep the fixed-position
  // ghost aligned with the rects it was measured against (see the ghost render below).
  const [dragState, setDragState] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragStart = ({ active }) => {
    const fromPath = String(active.id).split('.').map(Number);
    // The root list has no chrome of its own, so nothing registers it the way each node
    // registers itself. Queried at drag start rather than held in a ref because
    // CustomSheetBody owns this element; the creator only owns the wrapper around it.
    const rootEl = sheetWrapperRef.current?.querySelector('.custom-sheet__sections') || null;
    const entries = buildDragEntries(rootEl, [...nodeEls.current.values()]);
    const rects = measureNodes(entries);
    const dragged = rects.find(n => n.path.join('.') === String(active.id));
    setDragState({
      fromPath,
      rects,
      draggedRect: dragged?.rect ?? null,
      target: null,
      scrollTop0: scrollRef.current?.scrollTop ?? 0,
    });
  };

  const handleDragMove = ({ activatorEvent, delta }) => {
    setDragState(prev => {
      if (!prev) return prev;
      const scrolled = (scrollRef.current?.scrollTop ?? 0) - prev.scrollTop0;
      const pointer = {
        x: activatorEvent.clientX + delta.x,
        y: activatorEvent.clientY + delta.y + scrolled,
      };
      const target = insertionAt(pointer, prev.rects);
      // Computed once, here, where the target itself is set — both the ghost render and
      // handleDragEnd below read this same decision rather than recomputing resolveDrop.
      const decision = resolveDrop(sections, prev.fromPath, target);
      return { ...prev, target, decision, scrolled };
    });
  };

  const handleDragEnd = () => {
    setDragState(prev => {
      if (prev && prev.decision) {
        const decision = prev.decision;
        const draggedId = nodeId(nodeAt(sections, prev.fromPath));
        const next = moveNode(sections, prev.fromPath, decision.toParentPath, decision.toIndex);
        const newPath = indexNodes(next).get(draggedId) ?? null;
        const nextEditingPath = editingPathAfterMove(editingPath, prev.fromPath, newPath);
        if (nextEditingPath !== editingPath) setEditingPath(nextEditingPath);
        setAddingToPath(null);
        commit(next, newPath);
      }
      return null;
    });
  };

  const handleDragCancel = () => setDragState(null);

  useEffect(() => {
    setSections(template?.sections || []);
    setName(template?.name || '');
    setSettings(template?.settings || { diceButtons: [] });
    setIsPublic(template?.isPublic || false);
    setSelected(null);
    setEditingPath(null);
    setAddingToPath(null);
    setDragState(null);
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

  // ── Tree operations ────────────────────────────────────────────────────────
  //
  // Every operation below is "resolve a path, hand it to a pure helper, save". The tree
  // manipulation lives in utils/templateSections.js so it can be tested without a DOM.

  // commit is the single place that pairs a tree write with everything that must stay in
  // sync with it: the tree and its selection. It never touches editingPath — see the
  // editingPath declaration above for why selecting and editing stay decoupled.
  const commit = (next, nextSelected) => {
    setSections(next);
    if (nextSelected !== undefined) setSelected(nextSelected);
    triggerSave(next, name);
  };

  const addSection = () => {
    const newSection = makeDefaultSection();
    const next = [...sections, newSection];
    setAddingToPath(null);
    commit(next, [next.length - 1]);
  };

  // addNode appends a field or a subsection to the container implied by the current
  // selection. With an empty template there is no container yet, so the click creates the
  // first root section instead — which is exactly what a "Section" click wanted anyway.
  const addNode = (type) => {
    const parentPath = containerPathFor(sections, selected);
    if (parentPath === null) return addSection();
    const node = makeDefaultField(type);
    const count = (childrenOf(nodeAt(sections, parentPath)) || []).length;
    const next = insertAtPath(sections, parentPath, count, node);
    setAddingToPath(null);
    commit(next, [...parentPath, count]);
  };

  // addNodeTo is the in-canvas "add field" list: the container is explicit, not inferred.
  const addNodeTo = (parentPath, type) => {
    const node = makeDefaultField(type);
    const count = (childrenOf(nodeAt(sections, parentPath)) || []).length;
    const next = insertAtPath(sections, parentPath, count, node);
    setAddingToPath(null);
    commit(next, [...parentPath, count]);
  };

  const updateNode = (path, patch) => commit(updateAtPath(sections, path, patch));

  const removeNode = (path) => {
    setAddingToPath(null);
    // A removal shifts every later sibling's path, so the open properties popup must be
    // recomputed the same way a move or a duplicate already is — otherwise it silently starts
    // editing whichever node slid into the freed index.
    setEditingPath(prev => editingPathAfterRemove(prev, path));
    commit(removeAtPath(sections, path), null);
  };

  const moveWithinParent = (path, dir) => {
    const found = locate(sections, path);
    if (!found) return;
    const target = found.index + dir;
    if (target < 0 || target >= found.siblings.length) return;
    const parentPath = path.slice(0, -1);
    const newPath = [...parentPath, target];
    // Remove then insert, so the pure helpers stay the only writers of the tree.
    const next = insertAtPath(removeAtPath(sections, path), parentPath, target, found.node);
    setAddingToPath(null);
    // A move only ever displaces the node at `path` itself. If that is the node whose
    // properties are open, follow it — otherwise the popup would keep showing editingPath's
    // OLD slot, which after the move holds a different node (its displaced neighbour).
    if (samePath(editingPath, path)) setEditingPath(newPath);
    commit(next, newPath);
  };

  const duplicateNode = (path) => {
    const next = duplicateNodeAtPath(sections, path, {
      mint: genId,
      copySuffix: t('creator.copySuffix'),
    });
    // duplicateNodeAtPath always inserts the copy right after the original, at this path —
    // shiftPathAfterInsert keeps the property panel on whatever was selected regardless of
    // depth, including when the duplicated node is an ancestor of the current selection.
    const insertedPath = [...path.slice(0, -1), path[path.length - 1] + 1];
    const nextSelected = selected ? shiftPathAfterInsert(selected, insertedPath) : selected;
    // An insert shifts every path after it (unlike a move, which only relocates the single
    // node at `path`), so the open properties popup needs the same treatment `selected` gets
    // above. This keeps editingPath pointing at the ORIGINAL node the GM was editing — never
    // at the copy — even when the duplicated node sits before it in the same list.
    if (editingPath) setEditingPath(shiftPathAfterInsert(editingPath, insertedPath));
    setAddingToPath(null);
    commit(next, nextSelected);
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

  // Attribute list offered to formula builders (every attr field, at any nesting depth) and
  // the header chip's counts. walkFields visits leaves only, so sections need their own
  // recursion: the chip counts every container at every depth, not just the root list, or a
  // root section holding three subsections would read "1 section" next to "9 fields".
  const { numberFields, totalFieldCount, sectionCount } = useMemo(() => {
    const attrs = [];
    let n = 0;
    walkFields(sections, (f) => {
      if (f.type === 'attr') attrs.push(f);
      n += 1;
    });
    const countContainers = (list) => (list || []).reduce((acc, node) => {
      const kids = childrenOf(node);
      return kids ? acc + 1 + countContainers(kids) : acc;
    }, 0);
    return { numberFields: attrs, totalFieldCount: n, sectionCount: countContainers(sections) };
  }, [sections]);
  const editingNode = editingPath !== null ? nodeAt(sections, editingPath) : null;
  const editingIsSection = editingPath !== null
    && (editingPath.length === 1 || editingNode?.type === SECTION_TYPE);
  const editingSectionDef = editingIsSection ? sectionOf(editingNode) : null;
  const editingSiblingCount = editingPath !== null
    ? (locate(sections, editingPath)?.siblings.length ?? 0)
    : 0;

  // The creator's half of the renderChrome contract: given a node and its path, return the
  // affordances CustomSheetBody will position inside that node's wrapper. Up/down come from
  // the same moveWithinParent the old canvas used — they stay, as a keyboard-free fallback,
  // alongside the drag handle DraggableFieldChrome/DraggableSectionChrome now wire up.
  const buildChrome = useCallback((node, path) => {
    const isSection = path.length === 1 || node.type === SECTION_TYPE;
    const found = locate(sections, path);
    const index = found ? found.index : 0;
    const siblingCount = found ? found.siblings.length : 1;
    const common = {
      selected: samePath(selected, path),
      onSelect: () => setSelected(path),
      onEdit: () => setEditingPath(path),
      onDuplicate: () => duplicateNode(path),
      onRemove: () => removeNode(path),
      onMoveUp: () => moveWithinParent(path, -1),
      onMoveDown: () => moveWithinParent(path, +1),
      isFirst: index === 0,
      isLast: index === siblingCount - 1,
    };
    if (isSection) {
      const sectionDef = sectionOf(node);
      const isEmpty = (sectionDef?.fields || []).length === 0;
      return (
        <>
          <EditablePlaceholder node={node} />
          <DraggableSectionChrome
            path={path}
            registerNode={registerNode}
            isEmpty={isEmpty}
            section={sectionDef}
            onAddField={() => setAddingToPath(prev => (samePath(prev, path) ? null : path))}
            {...common}
          />
          {samePath(addingToPath, path) && (
            <div className="creator__inline-picker" onClick={e => e.stopPropagation()}>
              {FIELD_TYPES.map(ft => (
                <button
                  key={ft.type}
                  className="creator__inline-type-btn"
                  onClick={() => addNodeTo(path, ft.type)}
                >
                  <span className="creator__inline-type-icon">{ft.icon}</span>
                  <span>{t(ft.labelKey, { defaultValue: ft.type })}</span>
                </button>
              ))}
              <button className="creator__inline-cancel" onClick={() => setAddingToPath(null)}>✕</button>
            </div>
          )}
        </>
      );
    }
    return (
      <>
        <EditablePlaceholder node={node} />
        <DraggableFieldChrome
          path={path}
          registerNode={registerNode}
          field={node}
          duplicateKey={duplicateKeys?.has(node.key)}
          {...common}
        />
      </>
    );
    // editingPath is a dep, not an oversight to suppress: buildChrome closes over
    // moveWithinParent/duplicateNode, and those in turn close over editingPath to decide
    // whether the open properties popup should follow a move or a duplicate. Without
    // editingPath here, useCallback keeps returning the memoized function from BEFORE the
    // properties popup was opened, so those callbacks keep reading editingPath as it was at
    // that point (usually null) — the popup then silently stops following the node it is
    // editing on the very next reorder or duplicate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, selected, addingToPath, duplicateKeys, t, editingPath, registerNode]);

  // The dragged node's own content, rendered a second time (through CustomSheetBody, no
  // renderChrome) for both the DragOverlay and the out-of-flow ghost — plain data derived from
  // fromPath, so it is only recomputed when the drag target itself changes, not on every
  // pointer move. A dragged root section (or a nested one) is previewed as its own section;
  // a leaf field is wrapped in a throwaway single-field section so CustomSheetBody has
  // something to render it inside.
  const draggedGhostSections = useMemo(() => {
    if (!dragState) return null;
    const node = nodeAt(sections, dragState.fromPath);
    if (!node) return null;
    const isDraggedSection = dragState.fromPath.length === 1 || node.type === SECTION_TYPE;
    return isDraggedSection
      ? [sectionOf(node)]
      : [{ id: '__drag_ghost__', columns: 1, fields: [node] }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, dragState?.fromPath]);

  const ghostRectRaw = dragState
    ? ghostRectForDrop(dragState.decision, dragState.target, dragState.draggedRect, dragState.rects)
    : null;
  // ghostRectFor answers in the coordinate frame the rects were measured in — the viewport at
  // drag start. The ghost is position: fixed, i.e. in the CURRENT viewport, so it needs the
  // scroll delta taken back off. handleDragMove moves the pointer the other way, into the
  // measured frame; the two corrections have opposite signs on purpose.
  const ghostRect = ghostRectRaw
    ? { ...ghostRectRaw, top: ghostRectRaw.top - (dragState.scrolled || 0) }
    : null;

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
                  {t('creator.tabSheet')}
                </button>
              </>
            )}
          </nav>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'Crimson Text, serif' }}>
              {sectionCount} {t('creator.sections')} · {totalFieldCount} {t('creator.fields')}
            </Typography>
            {!isVariant && activeTab === 'fields' && (
              <IconButton
                onClick={() => setCleanPreview(v => !v)}
                size="small"
                aria-label={t('creator.previewToggle')}
              >
                {cleanPreview ? <VisibilityOffIcon /> : <VisibilityIcon />}
              </IconButton>
            )}
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
            {!isVariant && (
            <div className="creator__settings-card">
              <div className="creator__settings-card-header">
                <span className="creator__settings-card-title">{t('creator.general.sheetWidthTitle')}</span>
                <span className="creator__settings-card-hint">{t('creator.general.sheetWidthHint')}</span>
              </div>
              <div className="creator__settings-card-body">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, maxWidth: 420 }}>
                  <Slider
                    value={clampSheetWidth(settings.sheetWidth)}
                    min={SHEET_WIDTH_MIN}
                    max={SHEET_WIDTH_MAX}
                    step={SHEET_WIDTH_STEP}
                    onChange={(_, value) => updateSettings({ sheetWidth: value })}
                    sx={{ color: '#c9975b' }}
                  />
                  <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.95rem', color: '#3a2f1f', whiteSpace: 'nowrap', minWidth: 72, textAlign: 'right' }}>
                    {t('creator.general.sheetWidthValue', { width: clampSheetWidth(settings.sheetWidth) })}
                  </Typography>
                </Box>
                <Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.85rem', color: 'text.secondary', mt: 0.5 }}>
                  {t('creator.general.sheetWidthNote')}
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
                <span className="creator__settings-card-title">{t('creator.general.modifierTitle')}</span>
                <span className="creator__settings-card-hint">{t('creator.general.modifierHint')}</span>
              </div>
              <div className="creator__settings-card-body">
                <ModifierConfigBuilder
                  value={settings.modifier}
                  onChange={modifier => updateSettings({ modifier })}
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
        ) : <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >

        {/* Left: palette */}
        <aside className="creator__palette">
          <div className="creator__palette-header">
            <div className="creator__palette-title">{t('creator.components')}</div>
            {selected !== null ? (
              <div className="creator__palette-hint">
                → {(() => {
                  const parentPath = containerPathFor(sections, selected);
                  if (parentPath === null) return t('creator.sectionUnnamed');
                  const parent = nodeAt(sections, parentPath);
                  const def = sectionOf(parent);
                  return def?.title || t('creator.sectionUnnamed');
                })()}
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
                      onClick={() => addNode(ft.type)}
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

        {/* Center: the sheet itself, edit affordances layered on top via renderChrome */}
        <main
          className="creator__sheet-area"
          ref={scrollRef}
          onClick={() => { setSelected(null); setAddingToPath(null); }}
        >
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
            <div
              className="creator__sheet-stack"
              style={{ maxWidth: clampSheetWidth(settings.sheetWidth) }}
              onClick={e => e.stopPropagation()}
            >
              {/* The stack is capped at the sheet's own width and centred, so the sheet sits in
                  the middle of the editing area and the "add section" button — which is
                  width: 100% — lines up with it instead of spanning the whole viewport. */}
              {/* The real session wrapper, not a preview-only one. The old preview tab had its
                  own chrome and therefore no width cap, which is precisely what hid
                  FEATURE-212's content-width bug; mounting anything else here would reopen
                  that gap. */}
              <div className="custom-sheet" ref={sheetWrapperRef} style={{ maxWidth: clampSheetWidth(settings.sheetWidth) }}>
                <CustomSheetBody
                  sections={sections}
                  renderChrome={cleanPreview ? null : buildChrome}
                  showRollMarkers
                />
              </div>
              {/* Out of flow on purpose: previewing the drop by reserving real space would change
                  the very rectangles the drop decision was measured against (see resolveDrop /
                  sheetDnd.js). Rendered through CustomSheetBody, with no renderChrome, so it shows
                  exactly what the dragged node would look like once it lands. */}
              {ghostRect && draggedGhostSections && (
                <div className="creator__drop-ghost" style={ghostRect}>
                  <CustomSheetBody sections={draggedGhostSections} />
                </div>
              )}
              {!cleanPreview && (
                <button className="creator__add-section-btn" onClick={addSection}>
                  <AddIcon style={{ fontSize: 16 }} /> {t('creator.addSection')}
                </button>
              )}
            </div>
          )}
        </main>

        <PropertyPopup
          open={editingPath !== null}
          title={editingIsSection ? t('creator.sectionProperties') : t('creator.fieldProperties')}
          onClose={() => setEditingPath(null)}
        >
          {editingNode && !editingIsSection ? (
            <PropertyPanel
              field={editingNode}
              onChange={patch => updateNode(editingPath, patch)}
              onDelete={() => removeNode(editingPath)}
              numberFields={numberFields}
              sections={sections}
            />
          ) : editingSectionDef ? (
            <SectionPropertyPanel
              section={editingSectionDef}
              onChange={patch => updateNode(editingPath, patch)}
              onDelete={() => removeNode(editingPath)}
              index={editingPath[editingPath.length - 1]}
              siblingCount={editingSiblingCount}
              onMove={dir => moveWithinParent(editingPath, dir)}
            />
          ) : null}
        </PropertyPopup>

        <DragOverlay dropAnimation={null}>
          {dragState && draggedGhostSections && (
            <div className="creator__drag-overlay" style={{ width: dragState.draggedRect?.width }}>
              <CustomSheetBody sections={draggedGhostSections} />
            </div>
          )}
        </DragOverlay>
        </DndContext>}
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
