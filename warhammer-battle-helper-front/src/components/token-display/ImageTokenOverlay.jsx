import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingsIcon from '@mui/icons-material/Settings';
import { SkullIcon } from '../icons';
import { resolveIcon } from '../../utils/tokenIcons';
import { usePortalTooltip } from '../common/PortalTooltip';
import { patchSceneImageTokenHP, patchSceneImageTokenSlot, updateSceneImage } from '../../api/scenes';
import ImageTokenConfigPanel from './ImageTokenConfigPanel';
import NumberSlotInput from './NumberSlotInput';

// The ring scales with the token: its radius is derived from the token's LONGER side (so a
// non-square image gets a circle enclosing its longer dimension). These constants are tuned so a
// ~50px token reproduces the fixed character-token geometry (half 25 → ring 42, rest 17, etc.).
const MAX_SLOTS = 8;       // ring positions; slotOffset wraps past 8, so we cap.
const RING_MARGIN = 17;    // ring slots sit ~17px beyond the token's edge (25 + 17 = 42 at 50px)
const REST_FACTOR = 0.68;  // sun-at-rest radius as a fraction of half the long side (25 * 0.68 ≈ 17)
const EQUATOR_GAP = 38;    // gear/kill sit this far beyond the ring on the equator (42 + 38 = 80)
const HP_CLEAR = 16;       // HP stack's bottom edge sits this far beyond the top ring slot

function slotOffset(i, radius) {
  const a = (-90 + i * 45) * (Math.PI / 180);
  return { x: radius * Math.cos(a), y: radius * Math.sin(a) };
}

function hpTone(pct) {
  return pct > 50 ? 'good' : pct > 25 ? 'warn' : 'danger';
}

// ImageTokenOverlay renders the states/HP ring for a tokens-layer scene image. Unlike the
// character TokenOverlay it reads live values straight off the overlay object (slot.level /
// slot.number / bar.current), because an image-token's config and values are one and the same
// (never shared across documents). Editing is GM-only; players view it live.
export default function ImageTokenOverlay({ image, gameId, sceneId, selected, canEdit, gameSystem }) {
  const { t } = useTranslation();
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();
  const [configOpen, setConfigOpen] = useState(false);

  const overlay = image?.tokenOverlay;
  const enabled = !!overlay && overlay.enabled !== false;
  // Render a bar only once it has a max filled in. A bar hidden from players is masked server-side
  // to max 0 for non-GM viewers, so this same filter makes it invisible to them (the GM keeps the
  // real max, so still sees it). Blank/unconfigured bars stay off the token for everyone.
  const bars = enabled ? (overlay.hpBars || []).filter(b => Number(b.max) > 0) : [];
  const slots = enabled ? (overlay.slots || []).slice(0, MAX_SLOTS) : [];

  // Size-aware geometry from the token's longer side (falls back to 50px, the character size).
  const halfLong = Math.max(Number(image?.width) || 50, Number(image?.height) || 50) / 2;
  const ringRadius = halfLong + RING_MARGIN;
  const radius = selected ? ringRadius : halfLong * REST_FACTOR;
  const equatorX = ringRadius + EQUATOR_GAP;
  // Bottom-anchor the HP stack just beyond the top ring slot (radius + slot half + gap). Because
  // it's anchored by its bottom edge, adding more bars grows the stack upward instead of pushing a
  // bar down onto the slots. translateY(-100%) lifts the box by its own height first.
  const hpTransform = `translate(-50%, calc(-100% - ${radius + HP_CLEAR}px))`;

  const stepHP = (barId, delta) => {
    if (!canEdit) return;
    patchSceneImageTokenHP(gameId, sceneId, image.id, { barId, delta }).catch(() => {});
  };
  const bumpSlot = (slotId, delta) => {
    if (!canEdit) return;
    patchSceneImageTokenSlot(gameId, sceneId, image.id, { slotId, delta }).catch(() => {});
  };
  const setSlotNumber = (slotId, number) => {
    if (!canEdit) return;
    patchSceneImageTokenSlot(gameId, sceneId, image.id, { slotId, number }).catch(() => {});
  };

  // Kill marker — independent of the overlay config (renders even on a bare token), like
  // Character.killed. Toggled via the plain image PUT (killed is public, no masking).
  const killed = !!image?.killed;
  const toggleKilled = () => {
    if (!canEdit) return;
    updateSceneImage(gameId, sceneId, image.id, { killed: !killed }).catch(() => {});
  };

  // Nothing to draw yet and not selected: a bare tokens-layer image the GM hasn't configured.
  // Still render when killed (the strike is always shown), when selected+GM (so the gear/skull are
  // reachable), and while the config popup is open (it lives in this subtree — unmounting here
  // would close it mid-edit).
  const hasContent = bars.length > 0 || slots.some(s => s.type && s.type !== 'empty');
  if (!hasContent && !killed && !(selected && canEdit) && !configOpen) return null;

  return (
    <div className={`token-overlay img-token-overlay ${selected ? 'token-overlay--selected' : ''} ${killed ? 'token-overlay--killed' : ''}`}
      // Root is pointer-events:none (CSS); only the controls below opt back in. Stop mousedown/click
      // bubbling so a control (or the config popup, which portals out but still bubbles through the
      // React tree) never starts an image drag or toggles the token's selection on the container.
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}>
      {/* Kill strike — always visible when dead, independent of the overlay config. */}
      {killed && (
        <div className="img-token-kill-strike" aria-hidden="true"><span /><span /></div>
      )}

      {/* Kill toggle — GM only, on the right equator (3 o'clock), same spot as character tokens;
          the config gear sits opposite at 9 o'clock. */}
      {selected && canEdit && (
        <button type="button"
          className={`img-token-kill-toggle ${killed ? 'is-killed' : ''}`}
          style={{ left: '50%', top: '50%', transform: `translate(calc(-50% + ${equatorX}px), -50%)` }}
          onClick={(e) => { e.stopPropagation(); toggleKilled(); }}
          onMouseEnter={(e) => showTooltip(t('token.killed'), e.currentTarget)}
          onMouseLeave={hideTooltip}>
          <SkullIcon size={16} />
        </button>
      )}
      {/* HP bars — stacked upward from the token top (offset scales with the token). */}
      {bars.length > 0 && (
        <div className={`img-token-hp-stack ${selected ? 'img-token-hp-stack--expanded' : ''}`}
          style={{ transform: hpTransform }}>
          {bars.map(bar => {
            const pct = bar.max ? Math.max(0, Math.min(100, (bar.current / bar.max) * 100)) : 0;
            return (
              <div key={bar.id} className="img-token-hp">
                {selected && canEdit && (
                  <button className="token-hp__btn" onClick={(e) => { e.stopPropagation(); stepHP(bar.id, -1); }}>−</button>
                )}
                <div className="token-hp__track">
                  <div className={`token-hp__fill token-hp__fill--${hpTone(pct)}`}
                    style={{ width: `${pct}%`, ...(bar.color ? { background: bar.color } : {}) }} />
                  <span className="token-hp__text">{bar.current}{bar.max ? ` / ${bar.max}` : ''}</span>
                </div>
                {selected && canEdit && (
                  <button className="token-hp__btn" onClick={(e) => { e.stopPropagation(); stepHP(bar.id, 1); }}>+</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Ring / sun slots */}
      {slots.map((slot, i) => {
        if (!slot.type || slot.type === 'empty') return null;
        const off = slotOffset(i, radius);
        const posStyle = { left: '50%', top: '50%', transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))` };

        if (slot.type === 'icon') {
          const active = (slot.level || 0) > 0;
          if (!selected && !active) return null; // at rest, only show active conditions
          const Ico = resolveIcon(slot.icon);
          const label = slot.conditionLabel || slot.conditionKey;
          return (
            <div key={slot.id}
              className={`token-slot token-slot--icon ${active ? 'is-active' : 'is-inactive'}`}
              style={posStyle}
              onMouseEnter={label ? (e) => showTooltip(label, e.currentTarget) : undefined}
              onMouseLeave={label ? hideTooltip : undefined}
              onClick={(e) => { if (selected) { e.stopPropagation(); bumpSlot(slot.id, +1); } }}
              onContextMenu={(e) => { if (!selected) return; e.preventDefault(); e.stopPropagation(); bumpSlot(slot.id, -1); }}>
              {Ico ? <Ico sx={{ fontSize: selected ? 14 : 11 }} /> : '?'}
              {active && slot.level > 1 && <span className="token-slot__level">{slot.level}</span>}
            </div>
          );
        }

        // number chip
        if (!selected && (slot.number == null)) return null;
        const editable = selected && canEdit;
        return (
          <div key={slot.id} className="token-slot token-slot--num" style={posStyle} title={slot.numberLabel || ''}>
            {editable
              ? <NumberSlotInput value={slot.number ?? 0} onCommit={(n) => setSlotNumber(slot.id, n)} />
              : <span className="token-slot__val">{slot.number ?? 0}</span>}
            {slot.numberLabel && <span className="token-slot__cap">{slot.numberLabel}</span>}
            {editable && (
              <div className="token-step">
                <button onClick={(e) => { e.stopPropagation(); setSlotNumber(slot.id, (slot.number ?? 0) + 1); }}>▲</button>
                <button onClick={(e) => { e.stopPropagation(); setSlotNumber(slot.id, (slot.number ?? 0) - 1); }}>▼</button>
              </div>
            )}
          </div>
        );
      })}

      {/* Config gear — GM only, on the left equator (9 o'clock); the kill toggle takes the right
          equator to match character tokens. */}
      {selected && canEdit && (
        <button type="button"
          className="img-token-gear"
          style={{ left: '50%', top: '50%', transform: `translate(calc(-50% - ${equatorX}px), -50%)` }}
          onClick={(e) => { e.stopPropagation(); setConfigOpen(true); }}
          onMouseEnter={(e) => showTooltip(t('imageToken.configure'), e.currentTarget)}
          onMouseLeave={hideTooltip}>
          <SettingsIcon sx={{ fontSize: 16 }} />
        </button>
      )}

      {configOpen && (
        <ImageTokenConfigPanel
          image={image}
          gameId={gameId}
          sceneId={sceneId}
          gameSystem={gameSystem}
          onClose={() => setConfigOpen(false)}
        />
      )}

      {tooltipNode}
    </div>
  );
}
