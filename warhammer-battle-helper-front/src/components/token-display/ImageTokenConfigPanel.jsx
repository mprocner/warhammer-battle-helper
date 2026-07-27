import React, { useState } from 'react';
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
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import PinOutlinedIcon from '@mui/icons-material/PinOutlined';
import { resolveIcon } from '../../utils/tokenIcons';
import { getSystem } from '../../systems/registry';
import { updateSceneImage, applyImageTokenSlot } from '../../api/scenes';
import { usePortalTooltip } from '../common/PortalTooltip';
import ConfirmModal from '../common/ConfirmModal';
import TokenSlotConfigModal from '../creator/TokenSlotConfigModal';

const SLOT_COUNT = 8;
const MAX_BARS = 4;
const genId = () => Math.random().toString(36).slice(2, 10);

// Quick-pick bar colours (red / green / blue / yellow).
const PRESET_COLORS = ['#e03131', '#2f9e44', '#1971c2', '#f2cc0c'];

// A brand-new (never configured) token opens with three empty bars — green / blue / red — so the
// GM only has to fill in the numbers. Left blank they simply won't render over the token. They
// default to hidden from players (only the GM sees them until the eye toggle reveals one).
const defaultBars = () => [
  { id: `bar_${genId()}`, label: '', current: '', max: '', color: '#2f9e44', hidden: true, hideValues: false },
  { id: `bar_${genId()}`, label: '', current: '', max: '', color: '#1971c2', hidden: true, hideValues: false },
  { id: `bar_${genId()}`, label: '', current: '', max: '', color: '#e03131', hidden: true, hideValues: false },
];

// Position (percent) of ring slot i around the sample token — top, clockwise. Mirrors
// TokenDisplayBuilder.slotPos so the editor sun matches what renders on the map.
function slotPos(i) {
  const angle = (-90 + i * 45) * (Math.PI / 180);
  const r = 42;
  return { left: `${50 + r * Math.cos(angle)}%`, top: `${50 + r * Math.sin(angle)}%` };
}

// A local draft: 8 fixed ring slots (stable ids, 'empty' until configured) plus the HP-bar list.
// Live values (level/number/current) ride along on the copied objects so reconfiguring never
// resets an in-play token.
function draftFrom(overlay) {
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => {
    const s = overlay?.slots?.[i];
    return s && s.id ? { ...s } : { id: genId(), type: 'empty' };
  });
  return {
    enabled: overlay?.enabled !== false,
    // No saved overlay yet → seed the three default bars; otherwise respect what was saved.
    hpBars: overlay ? (overlay.hpBars || []).map(b => ({ ...b })) : defaultBars(),
    slots,
  };
}

// ImageTokenConfigPanel is the per-token "gear" editor (GM only). HP bars sit on top (they render
// above the ring on the map, so the editor mirrors that order); the ring slots are authored on a
// radial "sun" below (like the template creator's TokenDisplayBuilder). It persists the whole
// overlay in one PUT — frequent value bumps go through the atomic hp/slot endpoints instead
// (see ImageTokenOverlay).
export default function ImageTokenConfigPanel({ image, gameId, sceneId, gameSystem, onClose }) {
  const { t } = useTranslation();
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();
  const [draft, setDraft] = useState(() => draftFrom(image?.tokenOverlay));
  const [saving, setSaving] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null); // index | null
  const [confirmLock, setConfirmLock] = useState(null); // { index, toLocked } | null

  const presetConditions = getSystem(gameSystem)?.states || [];

  // ── HP bars ──────────────────────────────────────────────────────────────
  const addBar = () => {
    if (draft.hpBars.length >= MAX_BARS) return;
    setDraft(d => ({ ...d, hpBars: [...d.hpBars, { id: `bar_${genId()}`, label: '', current: 10, max: 10, color: '#c9975b', hidden: true, hideValues: false }] }));
  };
  const updateBar = (id, patch) => setDraft(d => ({ ...d, hpBars: d.hpBars.map(b => b.id === id ? { ...b, ...patch } : b) }));
  const removeBar = (id) => setDraft(d => ({ ...d, hpBars: d.hpBars.filter(b => b.id !== id) }));

  // ── Ring slots (sun) ──────────────────────────────────────────────────────
  const toggleSlotHidden = (index) => {
    setDraft(d => ({ ...d, slots: d.slots.map((s, i) => i === index ? { ...s, hidden: !s.hidden } : s) }));
  };

  // Config-only view of a slot (no id, no live value) for the "apply to all scene tokens" call.
  const slotConfigOf = (s) => ({
    type: s.type, icon: s.icon, conditionKey: s.conditionKey,
    conditionLabel: s.conditionLabel, numberLabel: s.numberLabel, hidden: !!s.hidden,
  });

  // Share (locked=true) or unshare (false) a ring position across every tokens-layer image in the
  // scene. Fire-and-forget to the backend, and mirror the effect into the local draft so the panel
  // stays consistent (locking resets this slot's live value here too).
  const applyToScene = (index, toLocked) => {
    const slot = draft.slots[index];
    applyImageTokenSlot(gameId, sceneId, {
      position: index,
      locked: toLocked,
      slot: toLocked ? slotConfigOf(slot) : undefined,
    }).catch(() => {});
    setDraft(d => ({
      ...d,
      slots: d.slots.map((s, i) => i === index
        ? (toLocked ? { ...s, locked: true, level: 0, number: 0 } : { ...s, locked: false })
        : s),
    }));
  };

  // Keep the slot's id and any live level/number; swap in the modal's config fields. If the slot is
  // locked (shared), editing it propagates the new config to every scene token (values reset).
  const saveSlot = (base) => {
    const index = editingSlot;
    const wasLocked = !!draft.slots[index]?.locked;
    setDraft(d => ({
      ...d,
      slots: d.slots.map((s, i) => i === index
        ? { ...s, ...base, id: s.id, ...(wasLocked ? { locked: true, level: 0, number: 0 } : {}) }
        : s),
    }));
    if (wasLocked) {
      applyImageTokenSlot(gameId, sceneId, { position: index, locked: true, slot: slotConfigOf(base) }).catch(() => {});
    }
    setEditingSlot(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Coerce the (possibly blank) bar numbers to real numbers for the backend float fields.
      const hpBars = draft.hpBars.map(b => ({ ...b, current: Number(b.current) || 0, max: Number(b.max) || 0 }));
      await updateSceneImage(gameId, sceneId, image.id, { tokenOverlay: { ...draft, hpBars, enabled: true } });
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const paperSx = { background: 'linear-gradient(135deg, #f4e8d8 0%, #e8dcc4 100%)', border: '1.5px solid #7a5c42' };
  const headSx = { fontSize: '0.8rem', color: '#7a5c42', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 };

  return (
    <>
      {/* Stop click/mousedown bubbling: this Dialog portals to <body> but stays in the React tree
          under SceneImage, whose onClick would otherwise deselect the token mid-edit. */}
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: paperSx }}
        onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#3a2f1f', fontFamily: 'Cinzel, serif' }}>
          {t('imageToken.configTitle')}
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          {/* HP bars — on top, matching how they render above the ring on the token. */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1, mb: 1 }}>
            <Typography sx={headSx}>{t('imageToken.hpBars')} ({draft.hpBars.length}/{MAX_BARS})</Typography>
            <Button size="small" startIcon={<AddIcon />} disabled={draft.hpBars.length >= MAX_BARS} onClick={addBar} sx={{ color: '#7a5c42' }}>
              {t('common.add')}
            </Button>
          </Box>
          {draft.hpBars.length === 0 && (
            <Typography sx={{ fontSize: '0.8rem', color: '#9a8468', mb: 1 }}>{t('imageToken.noBars')}</Typography>
          )}
          {draft.hpBars.map(bar => (
            <Box key={bar.id} sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1 }}>
              <TextField size="small" variant="outlined" label={t('imageToken.barLabel')} value={bar.label}
                onChange={e => updateBar(bar.id, { label: e.target.value })} sx={{ flex: 1 }} />
              <TextField size="small" variant="outlined" type="number" label={t('imageToken.barCurrent')} value={bar.current}
                onChange={e => updateBar(bar.id, { current: e.target.value })} sx={{ width: 80 }} />
              <TextField size="small" variant="outlined" type="number" label={t('imageToken.barMax')} value={bar.max}
                onChange={e => updateBar(bar.id, { max: e.target.value })} sx={{ width: 80 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                {PRESET_COLORS.map(c => (
                  <Box key={c} onClick={() => updateBar(bar.id, { color: c })}
                    title={t('imageToken.barColor')}
                    sx={{
                      width: 16, height: 16, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: bar.color === c ? '2px solid #3a2f1f' : '1px solid rgba(0,0,0,0.25)',
                    }} />
                ))}
                <input type="color" value={bar.color || '#c9975b'} onChange={e => updateBar(bar.id, { color: e.target.value })}
                  title={t('imageToken.barColor')} style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
              </Box>
              <IconButton size="small" disabled={bar.hidden}
                title={bar.hideValues ? t('imageToken.showValues') : t('imageToken.hideValues')}
                onClick={() => updateBar(bar.id, { hideValues: !bar.hideValues })}
                sx={{ color: bar.hidden ? '#bbb' : (bar.hideValues ? '#b5482f' : '#5a7a42') }}>
                <PinOutlinedIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" title={bar.hidden ? t('imageToken.hiddenFromPlayers') : t('imageToken.visibleToPlayers')}
                onClick={() => updateBar(bar.id, { hidden: !bar.hidden })} sx={{ color: bar.hidden ? '#b5482f' : '#5a7a42' }}>
                {bar.hidden ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
              </IconButton>
              <IconButton size="small" onClick={() => removeBar(bar.id)} sx={{ color: '#b5482f' }}><DeleteIcon fontSize="small" /></IconButton>
            </Box>
          ))}

          <Box sx={{ height: 1, background: '#c4a882', my: 2 }} />

          {/* States & numbers — radial sun editor */}
          <Typography sx={{ ...headSx, mb: 1 }}>{t('imageToken.statesNumbers')}</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: '#a89272', mb: 1 }}>{t('imageToken.sunHint')}</Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
            <Box sx={{ position: 'relative', width: 240, height: 240, flexShrink: 0 }}>
              {/* Sample token */}
              <Box sx={{
                position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                width: 54, height: 54, borderRadius: '50%', border: '2.5px solid #c9975b',
                background: 'linear-gradient(135deg, #7a6a58, #5a4a3a)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.9)',
                fontFamily: 'Georgia, serif', fontWeight: 700,
              }}>T</Box>

              {draft.slots.map((slot, i) => {
                const pos = slotPos(i);
                const configured = slot.type && slot.type !== 'empty';
                const Ico = slot.type === 'icon' ? resolveIcon(slot.icon) : null;
                const summary = slot.type === 'icon' ? (slot.conditionLabel || slot.conditionKey || '')
                  : slot.type === 'number' ? (slot.numberLabel || '') : '';
                return (
                  <Box key={slot.id} onClick={() => setEditingSlot(i)} title={summary}
                    sx={{
                      position: 'absolute', left: pos.left, top: pos.top, transform: 'translate(-50%, -50%)',
                      width: 32, height: 32, borderRadius: slot.type === 'number' ? '6px' : '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      border: configured ? '1.5px solid #c9975b' : '1.5px dashed #c4a882',
                      background: configured ? 'rgba(20,12,4,0.85)' : 'rgba(255,249,240,0.6)',
                      color: configured ? '#f0d8b0' : '#c4a882', fontSize: '0.7rem', fontWeight: 700,
                    }}>
                    {!configured ? <AddIcon sx={{ fontSize: 16 }} />
                      : Ico ? <Ico sx={{ fontSize: 16 }} />
                      : (slot.numberLabel || '').slice(0, 3)}
                    {configured && (
                      <Box
                        onClick={(e) => { e.stopPropagation(); toggleSlotHidden(i); }}
                        onMouseEnter={(e) => showTooltip(t('imageToken.visibleToPlayers'), e.currentTarget)}
                        onMouseLeave={hideTooltip}
                        sx={{
                          position: 'absolute', top: -11, right: -11, width: 24, height: 24, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: '#fff9f0', border: '1px solid #c4a882', cursor: 'pointer',
                          color: slot.hidden ? '#b5482f' : '#5a7a42',
                        }}>
                        {slot.hidden
                          ? <VisibilityOffIcon sx={{ fontSize: 17 }} />
                          : <VisibilityIcon sx={{ fontSize: 17 }} />}
                      </Box>
                    )}
                    {configured && (
                      <Box
                        onClick={(e) => { e.stopPropagation(); setConfirmLock({ index: i, toLocked: !slot.locked }); }}
                        onMouseEnter={(e) => showTooltip(slot.locked ? t('imageToken.unshareAll') : t('imageToken.shareAll'), e.currentTarget)}
                        onMouseLeave={hideTooltip}
                        sx={{
                          position: 'absolute', top: -11, left: -11, width: 24, height: 24, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: '#fff9f0', border: '1px solid #c4a882', cursor: 'pointer',
                          color: slot.locked ? '#7a5c42' : '#a89272',
                        }}>
                        {slot.locked
                          ? <LockOutlinedIcon sx={{ fontSize: 16 }} />
                          : <LockOpenOutlinedIcon sx={{ fontSize: 16 }} />}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} sx={{ color: '#7a5c42' }}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving} variant="contained" sx={{ background: '#7a5c42', '&:hover': { background: '#5a4230' } }}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {editingSlot != null && (
        <TokenSlotConfigModal
          open
          slot={draft.slots[editingSlot]}
          allowedTypes={['empty', 'icon', 'number']}
          isSquare={false}
          allowHidden
          presetConditions={presetConditions}
          positionLabel={String(editingSlot)}
          onSave={saveSlot}
          onCancel={() => setEditingSlot(null)}
        />
      )}
      <ConfirmModal
        isOpen={!!confirmLock}
        message={confirmLock?.toLocked ? t('imageToken.shareAllConfirm') : t('imageToken.unshareAllConfirm')}
        confirmLabel={t('common.confirm')}
        onConfirm={() => { applyToScene(confirmLock.index, confirmLock.toLocked); setConfirmLock(null); }}
        onCancel={() => setConfirmLock(null)}
      />
      {tooltipNode}
    </>
  );
}
