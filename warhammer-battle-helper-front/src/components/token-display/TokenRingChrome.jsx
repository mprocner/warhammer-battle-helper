import React from 'react';
import { useTranslation } from 'react-i18next';
import { SkullIcon } from '../icons';
import { usePortalTooltip } from '../common/PortalTooltip';
import NumberSlotInput from './NumberSlotInput';
import { slotOffset } from '../../utils/tokenRingGeometry';

// Shared, purely-presentational chrome for BOTH token overlays (character + image). It renders the
// identical visual parts — container, kill strike/toggle, ring slots, HP bar visuals — from already
// resolved data + callbacks. The differing bits (where values come from, which API mutates them,
// the single-vs-many HP model, character squares vs image gear) stay in the thin wrappers, which
// pass a normalized `slots` array plus `renderHp` / `renderExtras`.

// Inner HP bar visual (track + fill + text + optional ± buttons). Shared by both HP models.
export function TokenHpBar({ current, max, pct, tone, color, canEdit, onStep }) {
  return (
    <>
      {canEdit && (
        <button className="token-hp__btn" onClick={(e) => { e.stopPropagation(); onStep(-1); }}>−</button>
      )}
      <div className="token-hp__track">
        <div className={`token-hp__fill token-hp__fill--${tone}`}
          style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }} />
        <span className="token-hp__text">{current}{max ? ` / ${max}` : ''}</span>
      </div>
      {canEdit && (
        <button className="token-hp__btn" onClick={(e) => { e.stopPropagation(); onStep(1); }}>+</button>
      )}
    </>
  );
}

// One ring slot. `slot` is normalized: { variant:'icon'|'chip', showAtRest, ... }. `index` is the
// slot's position in the original config array (drives the ring angle), so callers must keep empty
// slots as null placeholders rather than filtering them out.
function TokenSlot({ slot, index, radius, selected, showTooltip, hideTooltip }) {
  if (!selected && !slot.showAtRest) return null;
  const off = slotOffset(index, radius);
  const posStyle = { left: '50%', top: '50%', transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))` };

  if (slot.variant === 'icon') {
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

  return (
    <div className="token-slot token-slot--num" style={posStyle} title={slot.cap || ''}
      onClick={(e) => { if (selected && slot.onClick) { e.stopPropagation(); slot.onClick(); } }}>
      {slot.editable
        ? <NumberSlotInput value={slot.numberValue} onCommit={slot.onSetNumber} />
        : <span className="token-slot__val">{slot.value ?? '–'}</span>}
      {slot.cap && <span className="token-slot__cap">{slot.cap}</span>}
      {slot.editable && (
        <div className="token-step">
          <button onClick={(e) => { e.stopPropagation(); slot.onStep(+1); }}>▲</button>
          <button onClick={(e) => { e.stopPropagation(); slot.onStep(-1); }}>▼</button>
        </div>
      )}
    </div>
  );
}

export default function TokenRingChrome({
  extraClassName = '', selected, canEdit, killed,
  radius, equatorX,
  killStrikeClassName, killToggleClassName, onToggleKilled,
  slots = [],
  renderHp, renderExtras,
  stopContainerEvents = false,
}) {
  const { t } = useTranslation();
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();

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

      {renderHp && renderHp()}

      {slots.map((slot, i) => slot == null ? null : (
        <TokenSlot key={slot.id} slot={slot} index={i} radius={radius}
          selected={selected} showTooltip={showTooltip} hideTooltip={hideTooltip} />
      ))}

      {renderExtras && renderExtras({ showTooltip, hideTooltip })}

      {tooltipNode}
    </div>
  );
}
