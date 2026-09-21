import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
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
import LabelIcon from '@mui/icons-material/Label';
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PublicIcon from '@mui/icons-material/Public';
import LockIcon from '@mui/icons-material/Lock';
import {
  DndContext as DndKitContext,
  pointerWithin,
  rectIntersection,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { collectSkillOptions, renderDamageFormula } from '../../systems/custom/CustomSheetBody';
import TemplatePreview from './TemplatePreview';
import FormulaBuilder from './FormulaBuilder';
import DiceConfigBuilder from './DiceConfigBuilder';
import ModifierConfigBuilder from './ModifierConfigBuilder';
import TokenDisplayBuilder from './TokenDisplayBuilder';
import {
  SECTION_TYPE, sectionOf, nodeAt, locate, childrenOf, samePath,
  updateAtPath, insertAtPath, removeAtPath, duplicateNodeAtPath, walkFields,
  containerPathFor, shiftPathAfterInsert, indexNodes, moveNode, isContainer,
  dropSentinelId, dropHeaderId, dropIntent,
} from '../../utils/templateSections';
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
          control={<Switch checked={!!field.showOnShortCard} onChange={e => up({ showOnShortCard: e.target.checked })} size="small" />}
          label={<Typography sx={{ fontFamily: 'Crimson Text, serif', fontSize: '0.9rem' }}>{t('creator.showOnShortCard')}</Typography>}
          sx={{ mb: 1.5, display: 'block' }}
        />
      )}

      {/* type="number" only rejects non-numeric input, not decimals — a value like "2.5" would
          reach the backend as *int and 400 the whole template PATCH. saveTemplate swallows that
          error silently, so every later edit to the template would appear to vanish with no
          visible cause. Truncate to an integer here so that can never happen. */}
      {(field.type === 'attr' || field.type === 'number') && (
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <TextField size="small" label="Min" type="number" value={field.min ?? ''} onChange={e => up({ min: e.target.value === '' ? null : Math.trunc(Number(e.target.value)) })} sx={{ flex: 1 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' }, inputProps: { step: 1 } }} />
          <TextField size="small" label="Max" type="number" value={field.max ?? ''} onChange={e => up({ max: e.target.value === '' ? null : Math.trunc(Number(e.target.value)) })} sx={{ flex: 1 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' }, inputProps: { step: 1 } }} />
          <TextField size="small" label={t('creator.fieldDefault')} type="number" value={field.default ?? ''} onChange={e => up({ default: e.target.value === '' ? null : Math.trunc(Number(e.target.value)) })} sx={{ flex: 1 }} InputProps={{ sx: { fontFamily: 'Crimson Text, serif' }, inputProps: { step: 1 } }} />
        </Box>
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
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
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
            sx={{ flex: '0 0 140px' }}
            InputProps={{ sx: { fontFamily: 'Crimson Text, serif' }, inputProps: { step: 1, min: 1 } }}
          />
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

function SectionPropertyPanel({ section, onChange, onDelete, index, siblingCount, onMove }) {
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
  );
}

// ── FieldCard (in section canvas) ────────────────────────────────────────────

function FieldCard({ id, field, isSelected, isDuplicateKey, isDropBeside, onClick, onRemove, onDuplicate, onMoveUp, onMoveDown, isFirst, isLast }) {
  const { t } = useTranslation();
  const ti = typeInfo(field.type);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const dndStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      className={`creator__canvas-field${isSelected ? ' creator__canvas-field--selected' : ''}${isDuplicateKey ? ' creator__canvas-field--error' : ''}${isDropBeside ? ' creator__canvas-field--drop-beside' : ''}`}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      <div className="creator__canvas-field-drag" {...attributes} {...listeners}>
        <DragHandleIcon style={{ fontSize: 16 }} />
      </div>
      <div className="creator__canvas-field-type-tag">{t(ti?.labelKey, { defaultValue: field.type })}</div>
      {field.abbr
        ? <div className="creator__canvas-field-abbr">{field.abbr}</div>
        : <div className="creator__canvas-field-abbr creator__canvas-field-abbr--empty">
            {field.label || (field.type === 'label' && field.text) || <em>—</em>}
          </div>
      }
      {field.abbr && <div className="creator__canvas-field-label">{field.label}</div>}
      {(field.type === 'attr' || field.type === 'number') && (field.min != null || field.max != null || field.step > 1) && (
        <div className="creator__canvas-field-range">
          {(field.min != null || field.max != null) && `${field.min ?? '?'} – ${field.max ?? '?'}`}
          {(field.min != null || field.max != null) && field.step > 1 && ' · '}
          {field.step > 1 && t('creator.canvasStepChip', { step: field.step })}
        </div>
      )}
      {field.rollable && <div className="creator__canvas-field-roll-badge">⚄</div>}
      {field.showOnShortCard && SHORT_CARD_FIELD_TYPES.includes(field.type) && <div className="creator__canvas-field-short-badge" title={t('creator.showOnShortCard')}>▤</div>}
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
  section, path, siblingCount, selected,
  onSelect, onRemove, onMove, onDuplicate,
  onAddField, addingToPath, onToggleAdding, duplicateKeys, nested, intoTargetId, besideTargetId,
}) {
  const { t } = useTranslation();
  // A nested section is addressed by its wrapper field key, which section.id mirrors — so one
  // id works for DnD, React keys and the empty-drop sentinel at every depth.
  const id = section.id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  // The header is this section's second droppable, and the one that keeps the ordinary
  // sortable meaning: hovering it asks to reorder the section among its siblings, while
  // hovering anything else in the section asks to drop the node INSIDE it. A plain droppable,
  // not a sortable item — it belongs to no SortableContext and takes part in no displacement
  // maths. The drag listeners live on the handle span below, so this ref shares no element
  // with them.
  const { setNodeRef: setHeaderDropRef } = useDroppable({ id: dropHeaderId(id) });
  const dndStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const isActiveSection = samePath(selected, path);
  // A drop would land INSIDE this section, so it shows itself as the receiving container.
  const isIntoTarget = intoTargetId === section.id;
  const isAddingHere = samePath(addingToPath, path);
  const cols = section.columns || 3;
  const index = path[path.length - 1];

  // The sentinel is the LAST sortable id of every section: hovering a field card means
  // "insert where that card sits", so without a trailing append target the slot past the last
  // child is unreachable. It doubles as the droppable `over` is redirected to whenever the
  // pointer asks to drop INSIDE this section — see redirectIntoTarget.
  const childIds = [...section.fields.map(f => f.key), dropSentinelId(section.id)];

  return (
    <div
      ref={setNodeRef}
      style={dndStyle}
      className={`creator__section${isActiveSection ? ' creator__section--active' : ''}${nested ? ' creator__section--nested' : ''}${isIntoTarget ? ' creator__section--drop-into' : ''}`}
      onClick={e => { e.stopPropagation(); onSelect(path); }}
    >
      <div ref={setHeaderDropRef} className="creator__section-header">
        <span className="creator__section-drag" {...attributes} {...listeners}><DragHandleIcon style={{ fontSize: 16 }} /></span>
        <span className="creator__section-title-label">
          {section.title || <em style={{ opacity: 0.45 }}>{t('creator.sectionNoName')}</em>}
        </span>
        <span className="creator__section-cols-badge">{cols} {t('creator.colSuffix')}</span>
        <div className="creator__section-actions">
          <button
            className="creator__section-action-btn"
            onClick={e => { e.stopPropagation(); onMove(path, -1); }}
            disabled={index === 0}
            title={t('creator.sectionMoveUpShort')}
          >
            <ArrowUpwardIcon style={{ fontSize: 13 }} />
          </button>
          <button
            className="creator__section-action-btn"
            onClick={e => { e.stopPropagation(); onMove(path, +1); }}
            disabled={index === siblingCount - 1}
            title={t('creator.sectionMoveDownShort')}
          >
            <ArrowDownwardIcon style={{ fontSize: 13 }} />
          </button>
          <button
            className="creator__section-action-btn"
            onClick={e => { e.stopPropagation(); onDuplicate(path); }}
            title={t('creator.sectionDuplicate')}
          >
            <ContentCopyIcon style={{ fontSize: 13 }} />
          </button>
          <button
            className="creator__section-action-btn creator__section-action-btn--danger"
            onClick={e => { e.stopPropagation(); onRemove(path); }}
            title={t('creator.sectionDelete')}
          >
            <DeleteIcon style={{ fontSize: 13 }} />
          </button>
        </div>
      </div>

      <div className="creator__section-body">
        <SortableContext items={childIds} strategy={rectSortingStrategy}>
          <div className={`creator__fields-grid creator__fields-grid--${cols}`}>
            {section.fields.map((child, i) => {
              const childPath = [...path, i];
              // One ordered list holds both shapes: a section field recurses, a leaf field
              // renders a card. Either way it occupies exactly one cell of this grid.
              return child.type === SECTION_TYPE && child.section ? (
                <SectionCanvas
                  key={child.key}
                  section={child.section}
                  path={childPath}
                  siblingCount={section.fields.length}
                  selected={selected}
                  onSelect={onSelect}
                  onRemove={onRemove}
                  onMove={onMove}
                  onDuplicate={onDuplicate}
                  onAddField={onAddField}
                  addingToPath={addingToPath}
                  onToggleAdding={onToggleAdding}
                  duplicateKeys={duplicateKeys}
                  intoTargetId={intoTargetId}
                  besideTargetId={besideTargetId}
                  nested
                />
              ) : (
                <FieldCard
                  key={child.key}
                  id={child.key}
                  field={child}
                  isSelected={samePath(selected, childPath)}
                  isDuplicateKey={duplicateKeys?.has(child.key)}
                  isDropBeside={besideTargetId === child.key}
                  onClick={() => onSelect(childPath)}
                  onRemove={() => onRemove(childPath)}
                  onDuplicate={() => onDuplicate(childPath)}
                  onMoveUp={() => onMove(childPath, -1)}
                  onMoveDown={() => onMove(childPath, +1)}
                  isFirst={i === 0}
                  isLast={i === section.fields.length - 1}
                />
              );
            })}
            <DropZone sectionId={section.id} empty={section.fields.length === 0} />
            {!isAddingHere && (
              <button
                className="creator__add-field-btn"
                onClick={e => { e.stopPropagation(); onToggleAdding(path); }}
              >
                <AddIcon style={{ fontSize: 14 }} /> {t('creator.addField')}
              </button>
            )}
          </div>
        </SortableContext>

        {isAddingHere && (
          <div className="creator__inline-picker">
            {FIELD_TYPES.map(ft => (
              <button
                key={ft.type}
                className="creator__inline-type-btn"
                onClick={e => { e.stopPropagation(); onAddField(path, ft.type); }}
              >
                <span className="creator__inline-type-icon">{ft.icon}</span>
                <span>{t(ft.labelKey, { defaultValue: ft.type })}</span>
              </button>
            ))}
            <button className="creator__inline-cancel" onClick={e => { e.stopPropagation(); onToggleAdding(null); }}>✕</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── DropZone ──────────────────────────────────────────────────────────────────

// The append target of a section, mounted after its last child at every depth. An empty
// section shows the full invitation; a populated one only needs a thin strip the pointer can
// reach past the last card, so it stays quiet until something is dragged over it.
//
// Hovering a section's body is signalled by highlighting the whole section, not by a ghost in
// this strip: a card-sized placeholder here has no reserved space of its own, so it overlapped
// the "add field" button and read as part of the section rather than as a preview.
function DropZone({ sectionId, empty }) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useSortable({ id: dropSentinelId(sectionId) });
  const variant = empty ? 'creator__drop-zone--empty' : 'creator__drop-zone--append';
  return (
    <div
      ref={setNodeRef}
      className={`creator__drop-zone ${variant}${isOver ? ' creator__drop-zone--over' : ''}`}
    >
      {empty ? t('creator.dropZone') : null}
    </div>
  );
}

// ── TemplateBuilder (main) ────────────────────────────────────────────────────

// redirectIntoTarget rewrites the winning collision when the pointer is asking to drop INSIDE
// a section. Leaving `over` on the section's own id would fight the SortableContext that
// section lives in: that context also holds the dragged node, so it would slide the section
// out from under a pointer that is still asking to drop inside it — the jumping the previous
// revision tried to fix by relocating the node mid-drag.
//
// The section's append sentinel says exactly the same thing (dropTargetOf maps both a section
// id and its sentinel to "append into that section") but lives in the section's OWN context,
// where the dragged node is not an item. @dnd-kit/sortable displaces only where a context
// knows BOTH indices — `displaceItem = isSorting && !disableTransforms &&
// isValidIndex(activeIndex) && isValidIndex(overIndex)`, sortable.cjs.development.js:514 with
// isValidIndex at :43 — so with `over` on the sentinel neither context moves anything: the
// dragged node's context does not know the sentinel, the target's context does not know the
// dragged node. The layout holds still, which is what keeps the decision from chasing itself.
//
// Only a section's own id is ever redirected. A hover that resolves to "beside" is left alone
// on purpose: there the sortable displacement IS the correct preview.
function redirectIntoTarget(collisions, activeId, sections) {
  const overId = collisions?.[0]?.id;
  if (overId == null) return collisions;
  const id = String(overId);
  const index = indexNodes(sections);
  const path = index.get(id);
  if (!path || !isContainer(nodeAt(sections, path))) return collisions;
  if (dropIntent(sections, index.get(String(activeId)), id)?.intoId !== id) return collisions;
  // Only `id` is read downstream: dnd-kit takes getFirstCollision(collisions, 'id') and looks
  // the container up in its own registry (core.cjs.development.js:2989 and :3257).
  return [{ ...collisions[0], id: dropSentinelId(id) }, ...collisions.slice(1)];
}

function findDuplicateKeys(sections) {
  const seen = {};
  const dupes = new Set();
  walkFields(sections, (field) => {
    if (seen[field.key]) dupes.add(field.key);
    else seen[field.key] = true;
  });
  return dupes;
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
  const [addingToPath, setAddingToPath] = useState(null); // path of the section whose "add field" list is open
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
    setAddingToPath(null);
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
  // sync with it: the tree and selection stay consistent with each other.
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
    commit(removeAtPath(sections, path), null);
  };

  const moveWithinParent = (path, dir) => {
    const found = locate(sections, path);
    if (!found) return;
    const target = found.index + dir;
    if (target < 0 || target >= found.siblings.length) return;
    const parentPath = path.slice(0, -1);
    // Remove then insert, so the pure helpers stay the only writers of the tree.
    const next = insertAtPath(removeAtPath(sections, path), parentPath, target, found.node);
    setAddingToPath(null);
    commit(next, [...parentPath, target]);
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

  // ── DnD ───────────────────────────────────────────────────────────────────

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const originalSectionsRef = useRef(null);
  // Which section currently reads as "drop inside me", or null. This is the ONLY state written
  // while the pointer moves; it is written from onDragOver, which dnd-kit fires only when
  // over.id CHANGES (core.cjs.development.js:3283 — the effect's dependency list is [overId]),
  // so never per animation frame. It drives nothing but a CSS class of colours and a shadow:
  // no size, no border width, no layout. It therefore cannot move a droppable, cannot change a
  // collision, and cannot feed back into the decision that produced it.
  const [intoTargetId, setIntoTargetId] = useState(null);
  // Which field card currently reads as "the dragged node lands beside me, in a different
  // list" — the cross-section counterpart of intoTargetId. Same write discipline: only from
  // onDragOver, only on an over.id change, and it drives nothing but a CSS pseudo-element
  // (colour, position, no size) — see dropIntent's besideId for why it is null within one list.
  const [besideTargetId, setBesideTargetId] = useState(null);

  // Nested containers overlap their parents geometrically, so closestCenter on a mix of
  // "child card" and "container" droppables keeps snapping to the parent box's centre and
  // dropping beside a subsection instead of inside it. pointerWithin answers "what is under
  // the cursor", which is the question a nested tree actually asks; rectIntersection only
  // covers the gap when the pointer leaves every droppable (e.g. dragging over the gutter).
  //
  // pointerWithin ranks a smaller rect ahead of the container enclosing it, so a section's
  // header wins over the section, and a field card wins over the section holding it.
  const collisionDetection = useCallback((args) => {
    const hits = pointerWithin(args);
    const collisions = hits.length > 0 ? hits : rectIntersection(args);
    return redirectIntoTarget(collisions, args.active.id, sectionsRef.current);
  }, [sectionsRef]);

  const handleDragStart = () => {
    originalSectionsRef.current = sectionsRef.current;
    setIntoTargetId(null);
    setBesideTargetId(null);
    clearTimeout(saveTimer.current);
  };

  const handleDragCancel = () => {
    const original = originalSectionsRef.current;
    originalSectionsRef.current = null;
    setIntoTargetId(null);
    setBesideTargetId(null);
    // handleDragStart cleared the debounced save, so every exit from a drag has to re-arm it
    // or an edit made just before the drag never reaches the server.
    if (original) { setSections(original); triggerSave(original, name); }
  };

  // The highlight, and nothing else. The tree is not touched until the drop, so a hover can no
  // longer change the layout it was read from.
  const handleDragOver = ({ active, over }) => {
    const cur = sectionsRef.current;
    const fromPath = over ? indexNodes(cur).get(String(active.id)) : null;
    const intent = fromPath ? dropIntent(cur, fromPath, String(over.id)) : null;
    setIntoTargetId(intent?.intoId ?? null);
    setBesideTargetId(intent?.besideId ?? null);
  };

  const handleDragEnd = ({ active, over }) => {
    originalSectionsRef.current = null;
    setIntoTargetId(null);
    setBesideTargetId(null);
    const cur = sectionsRef.current;
    const movedId = String(active.id);
    const fromPath = over ? indexNodes(cur).get(movedId) : null;
    const intent = fromPath ? dropIntent(cur, fromPath, String(over.id)) : null;
    // Every exit re-arms the debounced save handleDragStart cleared, including the ones that
    // move nothing.
    if (!intent) { triggerSave(cur, name); return; }

    const next = moveNode(cur, fromPath, intent.parentPath, intent.idx);
    // Follow the dragged node with the selection so the property panel does not jump to a
    // stranger: its path changed, its id did not. This runs even when the move was refused
    // (next === cur, so the id's path is unchanged too) — the user chose to keep that behaviour.
    commit(next, indexNodes(next).get(movedId) || null);
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
  const selectedNode = selected !== null ? nodeAt(sections, selected) : null;
  const selectedIsSection = selected !== null
    && (selected.length === 1 || selectedNode?.type === SECTION_TYPE);
  const selectedSectionDef = selectedIsSection ? sectionOf(selectedNode) : null;
  const selectedSiblingCount = selected !== null
    ? (locate(sections, selected)?.siblings.length ?? 0)
    : 0;

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
              {sectionCount} {t('creator.sections')} · {totalFieldCount} {t('creator.fields')}
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
        ) : activeTab === 'preview' ? <TemplatePreview sections={sections} name={name} width={clampSheetWidth(settings.sheetWidth)} /> : <>

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

        {/* Center: canvas */}
        <main className="creator__canvas-area" onClick={() => { setSelected(null); setAddingToPath(null); }}>
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
                  {sections.map((section, i) => (
                    <SectionCanvas
                      key={section.id}
                      section={section}
                      path={[i]}
                      siblingCount={sections.length}
                      selected={selected}
                      onSelect={setSelected}
                      onRemove={removeNode}
                      onMove={moveWithinParent}
                      onDuplicate={duplicateNode}
                      onAddField={addNodeTo}
                      addingToPath={addingToPath}
                      onToggleAdding={p => setAddingToPath(prev => (samePath(prev, p) ? null : p))}
                      duplicateKeys={duplicateKeys}
                      intoTargetId={intoTargetId}
                      besideTargetId={besideTargetId}
                      nested={false}
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
          {selected !== null && !selectedIsSection && selectedNode ? (
            <PropertyPanel
              field={selectedNode}
              onChange={patch => updateNode(selected, patch)}
              numberFields={numberFields}
              sections={sections}
            />
          ) : selectedSectionDef ? (
            <SectionPropertyPanel
              section={selectedSectionDef}
              onChange={patch => updateNode(selected, patch)}
              onDelete={() => removeNode(selected)}
              index={selected[selected.length - 1]}
              siblingCount={selectedSiblingCount}
              onMove={dir => moveWithinParent(selected, dir)}
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
