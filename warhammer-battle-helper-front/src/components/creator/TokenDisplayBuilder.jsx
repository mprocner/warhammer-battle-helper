import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography, TextField, MenuItem, IconButton, Button, Checkbox, FormControlLabel } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/CloseOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { resolveIcon } from '../../utils/tokenIcons';
import { getSystem } from '../../systems/registry';
import TokenSlotConfigModal from './TokenSlotConfigModal';

const SLOT_COUNT = 8;
const genId = () => Math.random().toString(36).slice(2, 10);
const BAR_COLORS = ['#e03131', '#2f9e44', '#1971c2', '#f2cc0c'];

// A fresh, empty layout: 8 fixed ring positions (stable ids), no HP bars, no squares.
function makeDefaultConfig() {
  return {
    enabled: true,
    slots: Array.from({ length: SLOT_COUNT }, () => ({ id: genId(), type: 'empty' })),
    hpBars: [],
    squares: [],
  };
}

// Ensure a config always has exactly 8 slots with ids, and an hpBars list (folding a legacy single
// hpBar into a one-element list if an un-migrated config reaches the editor).
function normalizeConfig(cfg) {
  if (!cfg) return makeDefaultConfig();
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const s = cfg.slots?.[i];
    return s && s.id ? s : { id: genId(), type: 'empty' };
  });
  let hpBars = cfg.hpBars;
  if (!hpBars) hpBars = cfg.hpBar ? [{ id: genId(), label: cfg.hpBar.label || '', field: cfg.hpBar }] : [];
  return { enabled: cfg.enabled !== false, slots, hpBars, squares: cfg.squares || [] };
}

// Position (percent) of ring slot i around the sample token, starting at top, clockwise.
function slotPos(i) {
  const angle = (-90 + i * 45) * (Math.PI / 180);
  const r = 42; // percent radius within the square editor box
  return { left: `${50 + r * Math.cos(angle)}%`, top: `${50 + r * Math.sin(angle)}%` };
}

// Short summary shown inside a configured slot chip and in the list panel.
function slotSummary(slot, t) {
  switch (slot.type) {
    case 'icon': return slot.conditionLabel || t('creator.tokenDisplay.slot.type_icon');
    case 'number': return slot.numberLabel || t('creator.tokenDisplay.slot.type_number');
    case 'field': return slot.field?.label || t('creator.tokenDisplay.slot.type_field');
    case 'select': return (slot.selectOptions || []).join(', ') || t('creator.tokenDisplay.slot.type_select');
    default: return '';
  }
}

// TokenDisplayBuilder is the "Token Display" card body in the creator's General tab
// (FEATURE-102): a radial 8-slot editor around a sample token, an HP-bar binder and a
// squares row. Bindable fields come from the backend for hardcoded systems (baseSystem)
// or from the template's own sections for custom systems.
export default function TokenDisplayBuilder({ value, onChange, baseSystem, sections, token }) {
  const { t } = useTranslation();
  const config = useMemo(() => normalizeConfig(value), [value]);
  const [tokenFieldsBySystem, setTokenFieldsBySystem] = useState(null);
  const [editing, setEditing] = useState(null); // { kind:'slot'|'square', index }

  // Fetch the hardcoded-system field catalog once (only needed for baseSystem variants).
  useEffect(() => {
    if (!baseSystem) return;
    let cancelled = false;
    fetch(`${getApiUrl()}/systems/tokenFields`, { headers: getApiHeaders({ Authorization: `Bearer ${token}` }) })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data) setTokenFieldsBySystem(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [baseSystem, token]);

  // Unified bindable-field list (attribute/number/progress) for the current system.
  const fields = useMemo(() => {
    if (baseSystem) return tokenFieldsBySystem?.[baseSystem] || [];
    // Custom system: derive from the template's own sections.
    const out = [];
    for (const sec of sections || []) {
      for (const f of sec.fields || []) {
        // Custom attributes are stored as { base, advances, current } — bind to .current.
        if (f.type === 'attr') out.push({ key: `attributes.${f.key}.current`, label: f.abbr || f.label, category: 'attribute' });
        else if (f.type === 'number') out.push({ key: `numbers.${f.key}`, label: f.abbr || f.label, category: 'number' });
        else if (f.type === 'progress') out.push({ key: `progress.${f.key}.current`, label: f.abbr || f.label, category: 'progress', progressMaxKey: `progress.${f.key}.max` });
      }
    }
    return out;
  }, [baseSystem, tokenFieldsBySystem, sections]);

  const progressFields = fields.filter(f => f.category === 'progress');

  // Preset conditions belong to the target system: only hardcoded systems (baseSystem)
  // have a condition catalog that auto-syncs with the sheet. Custom systems get none, so
  // the modal shows only the generic "browse all icons" picker. NB: getSystem falls back
  // to warhammer4e on an unknown key, so it must not be called with an empty baseSystem.
  const presetConditions = baseSystem ? (getSystem(baseSystem).states || []) : [];

  const commit = (next) => onChange(next);

  const saveSlot = (updated) => {
    const slots = config.slots.map((s, i) => (i === editing.index ? { ...updated, id: s.id } : s));
    commit({ ...config, slots });
    setEditing(null);
  };

  const saveSquare = (updated) => {
    let squares;
    if (editing.index === -1) {
      squares = [...config.squares, { ...updated, id: genId() }];
    } else {
      squares = config.squares.map((s, i) => (i === editing.index ? { ...updated, id: s.id } : s));
    }
    commit({ ...config, squares });
    setEditing(null);
  };

  const removeSquare = (i) => commit({ ...config, squares: config.squares.filter((_, idx) => idx !== i) });

  // Blueprint default player-visibility toggles (seed the per-token gear). Slots/squares carry
  // defaultHidden inline; the gear can override per token.
  const toggleSlotHidden = (i) => commit({ ...config, slots: config.slots.map((s, idx) => idx === i ? { ...s, defaultHidden: !s.defaultHidden } : s) });

  // ── HP bars (list) ──────────────────────────────────────────────────────
  const addBar = () => commit({ ...config, hpBars: [...config.hpBars, { id: genId(), label: '', color: BAR_COLORS[1], field: null, defaultHidden: false }] });
  const updateBar = (id, patch) => commit({ ...config, hpBars: config.hpBars.map(b => b.id === id ? { ...b, ...patch } : b) });
  const removeBar = (id) => commit({ ...config, hpBars: config.hpBars.filter(b => b.id !== id) });
  // "From card" toggle: bind to a progress field, or clear to make the bar manual (per-token values).
  const setBarFromCard = (id, on) => {
    if (!on) return updateBar(id, { field: null });
    const f = progressFields[0];
    updateBar(id, { field: f ? { key: f.key, maxKey: f.progressMaxKey, label: f.label } : null });
  };
  const setBarField = (id, key) => {
    const f = progressFields.find(pf => pf.key === key);
    updateBar(id, { field: f ? { key: f.key, maxKey: f.progressMaxKey, label: f.label } : null });
  };

  return (
    <Box>
      <Typography sx={{ fontSize: '0.85rem', color: '#7a5c42', mb: 1 }}>
        {t('creator.tokenDisplay.intro')}
      </Typography>

      {/* ── HP BARS (top, full width, ImageToken-style rows) ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#7a5c42' }}>{t('creator.tokenDisplay.hpBarsTitle')}</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={addBar} sx={{ color: '#7a5c42' }}>{t('common.add')}</Button>
      </Box>
      <Box sx={{ mb: 2 }}>
        {config.hpBars.length === 0 && (
          <Typography sx={{ fontSize: '0.78rem', color: '#a89272', mb: 1 }}>{t('creator.tokenDisplay.hpBarsEmpty')}</Typography>
        )}
        {config.hpBars.map(bar => (
          <Box key={bar.id} sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
            <TextField size="small" variant="outlined" label={t('imageToken.barLabel')} value={bar.label}
              onChange={e => updateBar(bar.id, { label: e.target.value })} sx={{ flex: 1, minWidth: 100 }} />
            <FormControlLabel
              sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: '0.72rem', color: '#7a5c42' } }}
              control={<Checkbox size="small" checked={!!bar.field} onChange={e => setBarFromCard(bar.id, e.target.checked)} />}
              label={t('creator.tokenDisplay.fromCard')}
            />
            {bar.field && (
              <TextField select size="small" variant="outlined" label={t('creator.tokenDisplay.hpBindLabel')} value={bar.field.key || ''} onChange={e => setBarField(bar.id, e.target.value)}
                sx={{ minWidth: 130 }} helperText={progressFields.length === 0 ? t('creator.tokenDisplay.hpBindEmpty') : undefined}>
                {progressFields.map(f => <MenuItem key={f.key} value={f.key}>{f.label}</MenuItem>)}
              </TextField>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
              {BAR_COLORS.map(c => (
                <Box key={c} onClick={() => updateBar(bar.id, { color: c })} title={t('imageToken.barColor')}
                  sx={{ width: 16, height: 16, borderRadius: '50%', background: c, cursor: 'pointer', border: bar.color === c ? '2px solid #3a2f1f' : '1px solid rgba(0,0,0,0.25)' }} />
              ))}
              <input type="color" value={bar.color || '#c9975b'} onChange={e => updateBar(bar.id, { color: e.target.value })}
                title={t('imageToken.barColor')} style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
            </Box>
            <IconButton size="small" title={bar.defaultHidden ? t('creator.tokenDisplay.hiddenByDefault') : t('creator.tokenDisplay.visibleByDefault')}
              onClick={() => updateBar(bar.id, { defaultHidden: !bar.defaultHidden })} sx={{ color: bar.defaultHidden ? '#b5482f' : '#5a7a42' }}>
              {bar.defaultHidden ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
            </IconButton>
            <IconButton size="small" onClick={() => removeBar(bar.id)} sx={{ color: '#b5482f' }}><DeleteIcon fontSize="small" /></IconButton>
          </Box>
        ))}
      </Box>

      <Box sx={{ height: 1, background: '#c4a882', my: 2 }} />

      {/* ── RING SLOTS (middle, radial sun like the gear popup) ── */}
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#7a5c42', mb: 0.5 }}>{t('creator.tokenDisplay.slotsTitle')}</Typography>
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
        <Box sx={{ position: 'relative', width: 240, height: 240, flexShrink: 0 }}>
          <Box sx={{
            position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
            width: 54, height: 54, borderRadius: '50%', border: '2.5px solid #c9975b',
            background: 'linear-gradient(135deg, #7a6a58, #5a4a3a)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.9)',
            fontFamily: 'Georgia, serif', fontWeight: 700,
          }}>T</Box>

          {config.slots.map((slot, i) => {
            const pos = slotPos(i);
            const configured = slot.type && slot.type !== 'empty';
            const Ico = slot.type === 'icon' ? resolveIcon(slot.icon) : null;
            return (
              <Box key={slot.id} onClick={() => setEditing({ kind: 'slot', index: i })} title={slotSummary(slot, t)}
                sx={{
                  position: 'absolute', left: pos.left, top: pos.top, transform: 'translate(-50%, -50%)',
                  width: 32, height: 32, borderRadius: slot.type === 'number' || slot.type === 'field' ? '6px' : '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  border: configured ? '1.5px solid #c9975b' : '1.5px dashed #c4a882',
                  background: configured ? 'rgba(20,12,4,0.85)' : 'rgba(255,249,240,0.6)',
                  color: configured ? '#f0d8b0' : '#c4a882', fontSize: '0.7rem', fontWeight: 700,
                }}>
                {!configured ? <AddIcon sx={{ fontSize: 16 }} />
                  : Ico ? <Ico sx={{ fontSize: 16 }} />
                  : slot.type === 'field' ? (slot.field?.label || '').slice(0, 3)
                  : slot.type === 'number' ? (slot.numberLabel || '').slice(0, 3)
                  : (slot.selectOptions?.[0] || '').slice(0, 3)}
                {/* defaultHidden eye per configured slot (top-right). */}
                {configured && (
                  <Box onClick={(e) => { e.stopPropagation(); toggleSlotHidden(i); }}
                    title={slot.defaultHidden ? t('creator.tokenDisplay.hiddenByDefault') : t('creator.tokenDisplay.visibleByDefault')}
                    sx={{ position: 'absolute', top: -9, right: -9, width: 18, height: 18, borderRadius: '50%',
                      background: '#fff9f0', border: '1px solid #c4a882', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: slot.defaultHidden ? '#b5482f' : '#5a7a42' }}>
                    {slot.defaultHidden ? <VisibilityOffIcon sx={{ fontSize: 12 }} /> : <VisibilityIcon sx={{ fontSize: 12 }} />}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box sx={{ height: 1, background: '#c4a882', my: 2 }} />

      {/* ── SQUARES (bottom, full width) ── */}
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#7a5c42', mb: 0.5 }}>{t('creator.tokenDisplay.squares.title')}</Typography>
      <Typography sx={{ fontSize: '0.75rem', color: '#a89272', mb: 1 }}>{t('creator.tokenDisplay.squares.hint')}</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {config.squares.map((sq, i) => (
          <Box key={sq.id} sx={{ position: 'relative' }}>
            <Box onClick={() => setEditing({ kind: 'square', index: i })} title={sq.caption}
              sx={{ width: 48, minHeight: 44, border: '1.5px solid #c9975b', borderRadius: '6px', background: 'rgba(20,12,4,0.85)', color: '#f0d8b0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', p: 0.5 }}>
              <Box sx={{ fontSize: '0.7rem', fontWeight: 700 }}>{sq.field?.label || sq.numberLabel || (sq.selectOptions?.[0] || '').slice(0, 3) || '—'}</Box>
              <Box sx={{ fontSize: '0.55rem', color: '#c4a882', textAlign: 'center' }}>{sq.caption}</Box>
            </Box>
            <IconButton size="small" onClick={() => removeSquare(i)}
              sx={{ position: 'absolute', top: -10, right: -10, width: 18, height: 18, background: '#fff9f0', border: '1px solid #c4a882' }}>
              <CloseIcon sx={{ fontSize: 12, color: '#883030' }} />
            </IconButton>
          </Box>
        ))}
        <Box onClick={() => setEditing({ kind: 'square', index: -1 })} title={t('creator.tokenDisplay.squares.addButton')}
          sx={{ width: 48, minHeight: 44, border: '1.5px dashed #c4a882', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#c4a882' }}>
          <AddIcon sx={{ fontSize: 20 }} />
        </Box>
      </Box>

      {editing && editing.kind === 'slot' && (
        <TokenSlotConfigModal
          open
          slot={config.slots[editing.index]}
          allowedTypes={['empty', 'icon', 'number', 'field', 'select']}
          isSquare={false}
          fields={fields}
          presetConditions={presetConditions}
          positionLabel={String(editing.index)}
          onSave={saveSlot}
          onCancel={() => setEditing(null)}
        />
      )}
      {editing && editing.kind === 'square' && (
        <TokenSlotConfigModal
          open
          slot={editing.index === -1 ? null : config.squares[editing.index]}
          allowedTypes={['number', 'field', 'select']}
          isSquare
          fields={fields}
          onSave={saveSquare}
          onCancel={() => setEditing(null)}
        />
      )}
    </Box>
  );
}
