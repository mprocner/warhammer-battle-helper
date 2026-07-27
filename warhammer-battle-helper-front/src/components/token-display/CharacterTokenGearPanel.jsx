import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, Box, Typography, IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/CloseOutlined';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import DesignServicesIcon from '@mui/icons-material/DesignServicesOutlined';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import EditIcon from '@mui/icons-material/EditOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PinOutlinedIcon from '@mui/icons-material/PinOutlined';
import { resolveIcon } from '../../utils/tokenIcons';
import { resolveField } from '../../utils/tokenFieldResolver';
import { getSystem } from '../../systems/registry';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { usePortalTooltip } from '../common/PortalTooltip';
import TokenSlotConfigModal from '../creator/TokenSlotConfigModal';
import { saveGear } from '../../api/tokenGear';

const BAR_COLORS = ['#e03131', '#2f9e44', '#1971c2', '#f2cc0c'];
const genId = () => Math.random().toString(36).slice(2, 10);

function slotPos(i) {
  const angle = (-90 + i * 45) * (Math.PI / 180);
  const r = 42;
  return { left: `${50 + r * Math.cos(angle)}%`, top: `${50 + r * Math.sin(angle)}%` };
}

// Deep-ish copy of the gear into an editable draft (Save persists it; Cancel discards it).
function draftFrom(gear) {
  const g = gear || {};
  return {
    slotOverrides: JSON.parse(JSON.stringify(g.slotOverrides || {})),
    barOverrides: { ...(g.barOverrides || {}) },
    barHideValues: { ...(g.barHideValues || {}) },
    barValues: JSON.parse(JSON.stringify(g.barValues || {})),
    addedBars: JSON.parse(JSON.stringify(g.addedBars || [])),
  };
}

function effectiveSlotAt(i, blueprintSlots, draft) {
  const bp = blueprintSlots[i] || { id: `p${i}`, type: 'empty' };
  const ov = draft.slotOverrides[bp.id];
  const slot = ov?.slot ?? bp;
  const hidden = ov?.hidden != null ? ov.hidden : !!slot.defaultHidden;
  return { slot, isOverride: !!ov?.slot, hidden, value: ov?.value ?? null };
}

// CharacterTokenGearPanel — per-token (per-placement) gear editor, GM-only. Edits accumulate in a
// local DRAFT; nothing persists (or reaches other players) until Save, which PUTs the whole gear and
// triggers a game-wide re-mask. Blueprint STRUCTURE is read-only here (edit via "Edit blueprint");
// this controls per-token visibility, manual values, per-position structural overrides, and per-token
// added bars. Mirrors ImageTokenConfigPanel's draft+Save model.
export default function CharacterTokenGearPanel({
  character, config, tokenGear, gameId, sceneId, placementId, gameSystem, token,
  systemLabel = '', tokenHidden = false, onClose, onEditBlueprint,
}) {
  const { t } = useTranslation();
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();
  const [draft, setDraft] = useState(() => draftFrom(tokenGear));
  const [editingSlot, setEditingSlot] = useState(null); // ring position index | null
  const [saving, setSaving] = useState(false);
  // Bindable character fields for a "field" slot override — same catalog the creator uses. Fetched
  // per hardcoded system; without it the slot config modal's field picker would be empty.
  const [fields, setFields] = useState([]);
  useEffect(() => {
    if (!gameSystem || gameSystem === 'custom' || !token) return;
    let cancelled = false;
    fetch(`${getApiUrl()}/systems/tokenFields`, { headers: getApiHeaders({ Authorization: `Bearer ${token}` }) })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data) setFields(data[gameSystem] || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [gameSystem, token]);

  const blueprintSlots = config?.slots || [];
  const blueprintBars = config?.hpBars || [];
  const presetConditions = gameSystem && gameSystem !== 'custom' ? (getSystem(gameSystem).states || []) : [];

  // ── Draft mutators (pure, immutable) ──────────────────────────────────────
  const patchSlotOverride = (id, patch) => setDraft(d => {
    const cur = d.slotOverrides[id] || {};
    return { ...d, slotOverrides: { ...d.slotOverrides, [id]: { ...cur, ...patch } } };
  });
  const clearSlotOverride = (id) => setDraft(d => {
    const next = { ...d.slotOverrides }; delete next[id];
    return { ...d, slotOverrides: next };
  });
  const setBarOverride = (id, hidden) => setDraft(d => ({ ...d, barOverrides: { ...d.barOverrides, [id]: hidden } }));
  const setBarHideValues = (id, hv) => setDraft(d => ({ ...d, barHideValues: { ...d.barHideValues, [id]: hv } }));
  const setBarValue = (id, patch) => setDraft(d => {
    // No upper clamp: current may exceed max on purpose (temporary buffs that raise the effective
    // maximum for the duration of an effect). Only guard against negatives.
    const merged = { current: 0, max: 0, ...d.barValues[id], ...patch };
    if (merged.current < 0) merged.current = 0;
    return { ...d, barValues: { ...d.barValues, [id]: merged } };
  });
  const updateAddedBar = (id, patch) => setDraft(d => ({ ...d, addedBars: d.addedBars.map(b => b.id === id ? { ...b, ...patch } : b) }));
  const removeAddedBar = (id) => setDraft(d => {
    const bv = { ...d.barValues }; delete bv[id];
    return { ...d, addedBars: d.addedBars.filter(b => b.id !== id), barValues: bv };
  });
  const addBar = () => setDraft(d => ({ ...d, addedBars: [...d.addedBars, { id: genId(), label: '', color: BAR_COLORS[0], defaultHidden: false, defaultHideValues: false }] }));

  // ── Value helpers ──────────────────────────────────────────────────────────
  const barHidden = (bar, isAdded) => {
    if (isAdded) return !!bar.defaultHidden;
    const ov = draft.barOverrides[bar.id];
    return ov != null ? ov : !!bar.defaultHidden;
  };
  const barValuesHidden = (bar, isAdded) => {
    if (isAdded) return !!bar.defaultHideValues;
    const ov = draft.barHideValues[bar.id];
    return ov != null ? ov : !!bar.defaultHideValues;
  };
  const barCur = (bar) => bar.field ? (resolveField(character, bar.field).value ?? 0) : (draft.barValues[bar.id]?.current ?? 0);
  const barMx = (bar) => bar.field ? (resolveField(character, bar.field).max ?? 0) : (draft.barValues[bar.id]?.max ?? 0);

  const saveSlotStructure = (base) => {
    const posId = blueprintSlots[editingSlot]?.id ?? `p${editingSlot}`; // consistent with effectiveSlotAt's fallback key
    patchSlotOverride(posId, { slot: { ...base, id: posId } });
    setEditingSlot(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveGear(gameId, sceneId, placementId, draft, token);
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const paperSx = { background: 'linear-gradient(135deg, #f4e8d8 0%, #e8dcc4 100%)', border: '1.5px solid #7a5c42' };
  const headSx = { fontSize: '0.8rem', color: '#7a5c42', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 };
  const hintSx = { fontSize: '0.875rem', color: '#7a5c42', mb: 1 };
  const sub = (txt) => <Typography sx={{ fontSize: '0.72rem', color: '#7a5c42', fontWeight: 700, textTransform: 'uppercase', mt: 1, mb: 0.5 }}>{txt}</Typography>;

  return (
    <>
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: paperSx }}
        onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#3a2f1f', fontFamily: 'Cinzel, serif' }}>
          {t('token.gear.title', { name: character?.basicInfo?.name || character?.name || '' })}
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          {/* Blueprint strip */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, py: 0.5, borderBottom: '1px solid #c4a882', mb: 1 }}>
            <Typography sx={{ fontSize: '0.78rem', color: '#7a5c42' }}>
              🔗 {t('token.gear.blueprintStrip', { system: systemLabel || gameSystem })}
            </Typography>
            {onEditBlueprint && (
              <Button size="small" endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />} onClick={onEditBlueprint}
                onMouseEnter={(e) => showTooltip(t('token.gear.editBlueprintHint'), e.currentTarget)} onMouseLeave={hideTooltip}
                sx={{ color: '#7a5c42', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                {t('token.gear.editBlueprint')}
              </Button>
            )}
          </Box>

          {tokenHidden && (
            <Box sx={{ background: 'rgba(181,72,47,0.1)', border: '1px solid #b5482f', borderRadius: '4px', p: 1, mb: 1.5 }}>
              <Typography sx={{ fontSize: '0.75rem', color: '#8a3320' }}>⚠ {t('token.gear.hiddenTokenWarning')}</Typography>
            </Box>
          )}

          {/* HP BARS */}
          <Typography sx={{ ...headSx, mt: 1 }}>{t('imageToken.hpBars')}</Typography>

          {blueprintBars.length > 0 && sub(t('token.gear.fromBlueprintSection'))}
          {blueprintBars.map(bar => {
            const hidden = barHidden(bar, false);
            const valuesHidden = barValuesHidden(bar, false);
            const manual = !bar.field;
            return (
              <Box key={bar.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, pl: 0.5 }}>
                <DesignServicesIcon sx={{ fontSize: 16, color: '#a89272' }}
                  onMouseEnter={(e) => showTooltip(t('token.gear.inheritedTooltip'), e.currentTarget)} onMouseLeave={hideTooltip} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.82rem', color: '#3a2f1f' }}>{bar.label || t('imageToken.barLabel')}</Typography>
                  {/* #4: show which character field this bar is bound to. */}
                  {bar.field && <Typography sx={{ fontSize: '0.68rem', color: '#7a5c42' }}>↳ {bar.field.label || bar.field.key}</Typography>}
                </Box>
                {manual ? (
                  <>
                    <TextField size="small" type="number" label={t('imageToken.barCurrent')} value={barCur(bar)}
                      onChange={e => setBarValue(bar.id, { current: Number(e.target.value) })} sx={{ width: 74 }} />
                    <TextField size="small" type="number" label={t('imageToken.barMax')} value={barMx(bar)}
                      onChange={e => setBarValue(bar.id, { max: Number(e.target.value) })} sx={{ width: 74 }} />
                  </>
                ) : (
                  <Typography sx={{ fontSize: '0.8rem', color: '#7a5c42' }}>{barCur(bar)} / {barMx(bar)}</Typography>
                )}
                <Box sx={{ width: 14, height: 14, borderRadius: '50%', background: bar.color || '#c9975b', border: '1px solid rgba(0,0,0,0.25)' }} />
                <IconButton size="small" disabled={hidden}
                  title={valuesHidden ? t('imageToken.showValues') : t('imageToken.hideValues')}
                  onClick={() => setBarHideValues(bar.id, !valuesHidden)}
                  sx={{ color: hidden ? '#bbb' : (valuesHidden ? '#b5482f' : '#5a7a42') }}>
                  <PinOutlinedIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => setBarOverride(bar.id, !hidden)} sx={{ color: hidden ? '#b5482f' : '#5a7a42' }}>
                  {hidden ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              </Box>
            );
          })}

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
            {sub(t('token.gear.addedHereSection'))}
            <Button size="small" startIcon={<AddIcon />} onClick={addBar} sx={{ color: '#7a5c42' }}>{t('token.gear.addBar')}</Button>
          </Box>
          {/* Added-bar rows — identical layout to ImageTokenConfigPanel (label / current / max /
              preset colors + custom / eye / delete), full width. */}
          {draft.addedBars.map(bar => {
            const hidden = !!bar.defaultHidden;
            return (
              <Box key={bar.id} sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1, borderLeft: '3px solid #c9975b', pl: 0.5 }}>
                <TextField size="small" variant="outlined" label={t('imageToken.barLabel')} value={bar.label}
                  onChange={e => updateAddedBar(bar.id, { label: e.target.value })} sx={{ flex: 1, minWidth: 90 }} />
                <TextField size="small" variant="outlined" type="number" label={t('imageToken.barCurrent')} value={draft.barValues[bar.id]?.current ?? 0}
                  onChange={e => setBarValue(bar.id, { current: Number(e.target.value) })} sx={{ width: 80 }} />
                <TextField size="small" variant="outlined" type="number" label={t('imageToken.barMax')} value={draft.barValues[bar.id]?.max ?? 0}
                  onChange={e => setBarValue(bar.id, { max: Number(e.target.value) })} sx={{ width: 80 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                  {BAR_COLORS.map(c => (
                    <Box key={c} onClick={() => updateAddedBar(bar.id, { color: c })} title={t('imageToken.barColor')}
                      sx={{ width: 16, height: 16, borderRadius: '50%', background: c, cursor: 'pointer', border: bar.color === c ? '2px solid #3a2f1f' : '1px solid rgba(0,0,0,0.25)' }} />
                  ))}
                  <input type="color" value={bar.color || '#c9975b'} onChange={e => updateAddedBar(bar.id, { color: e.target.value })}
                    title={t('imageToken.barColor')} style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                </Box>
                <IconButton size="small" disabled={hidden}
                  title={bar.defaultHideValues ? t('imageToken.showValues') : t('imageToken.hideValues')}
                  onClick={() => updateAddedBar(bar.id, { defaultHideValues: !bar.defaultHideValues })}
                  sx={{ color: hidden ? '#bbb' : (bar.defaultHideValues ? '#b5482f' : '#5a7a42') }}>
                  <PinOutlinedIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" title={hidden ? t('imageToken.hiddenFromPlayers') : t('imageToken.visibleToPlayers')}
                  onClick={() => updateAddedBar(bar.id, { defaultHidden: !hidden })} sx={{ color: hidden ? '#b5482f' : '#5a7a42' }}>
                  {hidden ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
                <IconButton size="small" onClick={() => removeAddedBar(bar.id)} sx={{ color: '#b5482f' }}><DeleteIcon fontSize="small" /></IconButton>
              </Box>
            );
          })}

          <Box sx={{ height: 1, background: '#c4a882', my: 2 }} />

          {/* RING SLOTS — single sun, per-position overlay */}
          <Typography sx={{ ...headSx, mb: 0.5 }}>{t('imageToken.statesNumbers')}</Typography>
          <Typography sx={hintSx}>{t('token.gear.slotHint')}</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
            <Box sx={{ position: 'relative', width: 240, height: 240, flexShrink: 0 }}>
              <Box sx={{
                position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                width: 54, height: 54, borderRadius: '50%', border: '2.5px solid #c9975b',
                background: 'linear-gradient(135deg, #7a6a58, #5a4a3a)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.9)', fontWeight: 700,
              }}>T</Box>

              {Array.from({ length: 8 }, (_, i) => {
                const pos = slotPos(i);
                const { slot, isOverride, hidden } = effectiveSlotAt(i, blueprintSlots, draft);
                const configured = slot.type && slot.type !== 'empty';
                const Ico = slot.type === 'icon' ? resolveIcon(slot.icon) : null;
                const posId = blueprintSlots[i]?.id ?? `p${i}`; // consistent with effectiveSlotAt's fallback key
                return (
                  <Box key={i} onClick={() => setEditingSlot(i)}
                    sx={{
                      position: 'absolute', left: pos.left, top: pos.top, transform: 'translate(-50%, -50%)',
                      width: 32, height: 32, borderRadius: slot.type === 'number' || slot.type === 'field' ? '6px' : '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      border: isOverride ? '2px solid #c9975b' : configured ? '1.5px solid #c9975b' : '1.5px dashed #c4a882',
                      background: configured ? 'rgba(20,12,4,0.85)' : 'rgba(255,249,240,0.6)',
                      color: configured ? '#f0d8b0' : '#c4a882', fontSize: '0.7rem', fontWeight: 700,
                      opacity: hidden ? 0.55 : 1,
                    }}>
                    {!configured ? <AddIcon sx={{ fontSize: 16 }} />
                      : Ico ? <Ico sx={{ fontSize: 16 }} />
                      : slot.type === 'field' ? (slot.field?.label || '').slice(0, 3)
                      : slot.type === 'number' ? (slot.numberLabel || '').slice(0, 3)
                      : (slot.selectOptions?.[0] || '').slice(0, 3)}

                    {configured && (
                      <Box sx={{ position: 'absolute', top: -9, left: -9, width: 18, height: 18, borderRadius: '50%',
                        background: '#fff9f0', border: '1px solid #c4a882', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: isOverride ? '#c9975b' : '#a89272' }}
                        onMouseEnter={(e) => showTooltip(isOverride ? t('token.gear.overrideTooltip') : t('token.gear.inheritedTooltip'), e.currentTarget)}
                        onMouseLeave={hideTooltip}>
                        {isOverride ? <EditIcon sx={{ fontSize: 12 }} /> : <DesignServicesIcon sx={{ fontSize: 12 }} />}
                      </Box>
                    )}
                    {configured && (
                      <Box onClick={(e) => { e.stopPropagation(); patchSlotOverride(posId, { hidden: !hidden }); }}
                        sx={{ position: 'absolute', top: -9, right: -9, width: 18, height: 18, borderRadius: '50%',
                          background: '#fff9f0', border: '1px solid #c4a882', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', color: hidden ? '#b5482f' : '#5a7a42' }}>
                        {hidden ? <VisibilityOffIcon sx={{ fontSize: 12 }} /> : <VisibilityIcon sx={{ fontSize: 12 }} />}
                      </Box>
                    )}
                    {isOverride && (
                      <Box onClick={(e) => { e.stopPropagation(); clearSlotOverride(posId); }}
                        onMouseEnter={(e) => showTooltip(t('token.gear.restoreFromBlueprint'), e.currentTarget)} onMouseLeave={hideTooltip}
                        sx={{ position: 'absolute', bottom: -9, right: -9, width: 18, height: 18, borderRadius: '50%',
                          background: '#fff9f0', border: '1px solid #c4a882', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#7a5c42' }}>
                        <RestartAltIcon sx={{ fontSize: 12 }} />
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>

        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving} sx={{ color: '#7a5c42' }}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving} variant="contained" sx={{ background: '#7a5c42', '&:hover': { background: '#5a4230' } }}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {editingSlot != null && (
        <TokenSlotConfigModal
          open
          slot={effectiveSlotAt(editingSlot, blueprintSlots, draft).slot}
          allowedTypes={['empty', 'icon', 'number', 'field', 'select']}
          isSquare={false}
          fields={fields}
          presetConditions={presetConditions}
          positionLabel={String(editingSlot)}
          onSave={saveSlotStructure}
          onCancel={() => setEditingSlot(null)}
        />
      )}
      {tooltipNode}
    </>
  );
}
