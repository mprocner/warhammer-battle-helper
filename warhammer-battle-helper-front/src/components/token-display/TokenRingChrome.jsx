import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SettingsIcon from '@mui/icons-material/Settings';
import { SkullIcon } from '../icons';
import { usePortalTooltip } from '../common/PortalTooltip';
import NumberSlotInput from './NumberSlotInput';
import { slotOffset, ACTIVE_PUSH } from '../../utils/tokenRingGeometry';

// Shared, purely-presentational chrome for BOTH token overlays (character + image). It renders the
// identical visual parts — container, kill strike/toggle, ring slots, HP bar visuals — from already
// resolved data + callbacks. The differing bits (where values come from, which API mutates them,
// the single-vs-many HP model, character squares vs image gear) stay in the thin wrappers, which
// pass a normalized `slots` array plus `renderHp` / `renderExtras`.

// Inner HP bar visual (track + fill + value + optional ± buttons). Shared by both HP models.
// When selected AND a label is present, the track shows the label on the left and the value on
// the right (labeled row); otherwise the value stays centered as before. Hovering a labelled bar
// shows the full label via the caller-supplied portal tooltip (survives ellipsis truncation).
export function TokenHpBar({ current, max, pct, tone, color, canEdit, onStep, label, selected, showTooltip, hideTooltip, valuesHidden = false }) {
  const hasLabel = !!label;
  const showLabel = selected && hasLabel;
  const showValue = !valuesHidden;
  const showSteps = canEdit && !valuesHidden;
  const valueText = `${current}${max ? ` / ${max}` : ''}`;
  return (
    <>
      {showSteps && (
        <button className="token-hp__btn" onClick={(e) => { e.stopPropagation(); onStep(-1); }}>−</button>
      )}
      <div className="token-hp__track"
        onMouseEnter={hasLabel && showTooltip ? (e) => showTooltip(label, e.currentTarget) : undefined}
        onMouseLeave={hasLabel && hideTooltip ? hideTooltip : undefined}>
        <div className={`token-hp__fill token-hp__fill--${tone}`}
          style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }} />
        {showLabel ? (
          <div className="token-hp__row">
            <span className="token-hp__label">{label}</span>
            {showValue && <span className="token-hp__text">{valueText}</span>}
          </div>
        ) : (
          showValue && <span className="token-hp__text">{valueText}</span>
        )}
      </div>
      {showSteps && (
        <button className="token-hp__btn" onClick={(e) => { e.stopPropagation(); onStep(1); }}>+</button>
      )}
    </>
  );
}

// One ring slot. `slot` is normalized: { variant:'icon'|'chip', showAtRest, ... }. `index` is the
// slot's position in the original config array (drives the ring angle), so callers must keep empty
// slots as null placeholders rather than filtering them out.
//
// A chip that can step (an editable number) needs room for a stepper, which does not fit between
// two neighbouring slots — so it only appears while the slot is active, and the chip pushes
// ACTIVE_PUSH outward along its ring angle to make space. Two consequences shape the markup:
//   - the handlers live on `.token-slot-zone`, a wrapper that does NOT move, so the chip sliding
//     out from under the pointer cannot trigger a mouseleave → mouseenter flicker loop;
//   - the zone is centred halfway along the push, so it covers both chip positions.
// Icon slots deliberately skip all of this: they are single-click toggles with no stepper to fit.
function TokenSlot({ slot, index, radius, selected, isActive, onHoverChange, onFocusChange, showTooltip, hideTooltip }) {
  if (!selected && !slot.showAtRest) return null;
  const off = slotOffset(index, radius);

  if (slot.variant === 'icon') {
    const posStyle = { left: '50%', top: '50%', transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))` };
    const Ico = slot.Icon;
    return (
      <div className={`token-slot token-slot--icon ${slot.active ? 'is-active' : 'is-inactive'}`}
        style={posStyle}
        onMouseEnter={slot.label ? (e) => showTooltip(slot.label, e.currentTarget) : undefined}
        onMouseLeave={slot.label ? hideTooltip : undefined}
        onClick={(e) => { if (selected) { e.stopPropagation(); slot.onBump(+1); } }}
        onContextMenu={(e) => { if (!selected) return; e.preventDefault(); e.stopPropagation(); slot.onBump(-1); }}>
        {Ico ? <Ico sx={{ fontSize: selected ? 14 : 11 }} /> : '?'}
        {slot.active && slot.level > 1 && <span className="token-slot__level">{slot.level}</span>}
      </div>
    );
  }

  const canStep = !!slot.editable && !!slot.onStep;
  const push = isActive && canStep ? ACTIVE_PUSH : 0;
  const dir = slotOffset(index, 1); // unit vector along this slot's ring angle
  const zone = { x: off.x + (dir.x * push) / 2, y: off.y + (dir.y * push) / 2 };
  const chipDx = (dir.x * push) / 2; // chip sits at the far end of the zone while active
  const chipDy = (dir.y * push) / 2;
  const clickable = selected && (canStep || !!slot.onClick);

  return (
    <div className={`token-slot-zone ${isActive ? 'is-active' : ''}`}
      style={{ left: '50%', top: '50%', transform: `translate(calc(-50% + ${zone.x}px), calc(-50% + ${zone.y}px))` }}
      onMouseEnter={canStep ? () => onHoverChange(true) : undefined}
      onMouseLeave={canStep ? () => onHoverChange(false) : undefined}
      onClick={canStep ? () => onHoverChange(true) : undefined}>
      <div className={`token-slot token-slot--num ${isActive ? 'is-active' : ''} ${clickable ? 'is-clickable' : ''}`}
        style={{ left: '50%', top: '50%', transform: `translate(calc(-50% + ${chipDx}px), calc(-50% + ${chipDy}px))` }}
        title={slot.cap || ''}
        onClick={(e) => { if (selected && slot.onClick) { e.stopPropagation(); slot.onClick(); } }}>
        {slot.editable
          ? <NumberSlotInput value={slot.numberValue} onCommit={slot.onSetNumber} onFocusChange={onFocusChange} />
          : <span className="token-slot__val">{slot.value ?? '–'}</span>}
        {slot.cap && <span className="token-slot__cap">{slot.cap}</span>}
        {isActive && canStep && (
          <div className="token-step token-step--sq">
            <button onClick={(e) => { e.stopPropagation(); slot.onStep(+1); }}>▲</button>
            <button onClick={(e) => { e.stopPropagation(); slot.onStep(-1); }}>▼</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TokenRingChrome({
  extraClassName = '', selected, canEdit, killed,
  radius, equatorX,
  killStrikeClassName, killToggleClassName, onToggleKilled,
  // Player-visibility toggle (GM-only). Rendered as an eye stacked under the kill toggle.
  canManageVisibility = false, hiddenFromPlayers = false, onToggleVisibility, visibilityToggleClassName,
  // Per-token gear config (GM-only). Rendered as a gear on the left equator (9 o'clock).
  canConfigureGear = false, onConfigureGear, gearToggleClassName,
  slots = [],
  renderHp, renderExtras,
  stopContainerEvents = false,
}) {
  const { t } = useTranslation();
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();

  // Which slot shows its stepper. Hover and focus are tracked separately so that typing a value
  // and then moving the pointer away does not collapse the chip mid-edit, and so that blurring
  // the field while still hovering leaves it open. Touch sets the hover id via the zone's onClick.
  const [hoverSlotId, setHoverSlotId] = useState(null);
  const [focusSlotId, setFocusSlotId] = useState(null);
  const activeSlotId = focusSlotId ?? hoverSlotId;

  // Deselecting must clear both, or a stale id makes the slot reappear already pushed out.
  useEffect(() => {
    if (!selected) { setHoverSlotId(null); setFocusSlotId(null); }
  }, [selected]);

  return (
    // Root is pointer-events:none (CSS); only the controls opt back in. Image tokens additionally
    // stop container-level bubbling (stopContainerEvents) so a control never starts an image drag;
    // character tokens leave it off so an at-rest slot click still selects the token (as before).
    <div className={`token-overlay ${extraClassName} ${selected ? 'token-overlay--selected' : ''} ${killed ? 'token-overlay--killed' : ''}`}
      onMouseDown={stopContainerEvents ? (e) => e.stopPropagation() : undefined}
      onClick={stopContainerEvents ? (e) => e.stopPropagation() : undefined}>
      {/* Kill strike — always visible when dead, independent of the overlay config. */}
      {killed && (
        <div className={killStrikeClassName} aria-hidden="true"><span /><span /></div>
      )}

      {/* Kill toggle — only on a selected, editable token; right equator (3 o'clock). */}
      {selected && canEdit && (
        <button type="button"
          className={`${killToggleClassName} ${killed ? 'is-killed' : ''}`}
          style={{ left: '50%', top: '50%', transform: `translate(calc(-50% + ${equatorX}px), -50%)` }}
          onClick={(e) => { e.stopPropagation(); onToggleKilled(); }}
          onMouseEnter={(e) => showTooltip(t('token.killed'), e.currentTarget)}
          onMouseLeave={hideTooltip}>
          <SkullIcon size={16} />
        </button>
      )}

      {/* Player-visibility toggle — GM only, stacked just under the kill toggle (right equator). */}
      {selected && canManageVisibility && (
        <button type="button"
          className={`${visibilityToggleClassName} ${hiddenFromPlayers ? 'is-hidden' : ''}`}
          style={{ left: '50%', top: '50%', transform: `translate(calc(-50% + ${equatorX}px), calc(-50% + 26px))` }}
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
          onMouseEnter={(e) => showTooltip(t(hiddenFromPlayers ? 'token.showToPlayers' : 'token.hideFromPlayers'), e.currentTarget)}
          onMouseLeave={hideTooltip}>
          {hiddenFromPlayers ? <VisibilityOffIcon sx={{ fontSize: 15 }} /> : <VisibilityIcon sx={{ fontSize: 15 }} />}
        </button>
      )}

      {/* Gear config toggle — GM only, left equator (9 o'clock), opposite the kill toggle. */}
      {selected && canConfigureGear && (
        <button type="button"
          className={gearToggleClassName}
          style={{ left: '50%', top: '50%', transform: `translate(calc(-50% - ${equatorX}px), -50%)` }}
          onClick={(e) => { e.stopPropagation(); onConfigureGear(); }}
          onMouseEnter={(e) => showTooltip(t('token.gear.tooltip'), e.currentTarget)}
          onMouseLeave={hideTooltip}>
          <SettingsIcon sx={{ fontSize: 15 }} />
        </button>
      )}

      {renderHp && renderHp({ showTooltip, hideTooltip })}

      {slots.map((slot, i) => slot == null ? null : (
        <TokenSlot key={slot.id} slot={slot} index={i} radius={radius}
          selected={selected} isActive={activeSlotId === slot.id}
          onHoverChange={(on) => setHoverSlotId(on ? slot.id : null)}
          onFocusChange={(on) => setFocusSlotId(on ? slot.id : null)}
          showTooltip={showTooltip} hideTooltip={hideTooltip} />
      ))}

      {renderExtras && renderExtras({ showTooltip, hideTooltip })}

      {tooltipNode}
    </div>
  );
}
