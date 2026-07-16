import React from 'react';
import { useTranslation } from 'react-i18next';
import { SkullIcon } from '../icons';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { resolveIcon } from '../../utils/tokenIcons';
import { resolveField } from '../../utils/tokenFieldResolver';
import { usePortalTooltip } from '../common/PortalTooltip';

// The kill toggle sits on the token's right equator (3 o'clock), beyond the ring. A selected
// slot reaches r≈53px (RING_RADIUS 42 + ~11px half-slot), and a *number* slot there also docks
// a ▲/▼ stepper that extends to ≈66px (.token-step right:-13px + 12px). A 22px button (radius
// 11) must therefore start past 66px → centre at 80px (66 + 11 + ~3px gap). The equator is the
// only band free of the HP bar (top) and squares row (bottom) regardless of the slot config.
const KILL_TOGGLE_X = 80;

// TokenOverlay renders a character token's condition/stat overlay on the map (FEATURE-102):
// a compact "sun" of active/valued slots at rest, expanding into a full interactive ring
// when the token is selected, plus a configurable HP bar and (when selected) a squares row.
//
// Layout follows docs/mockups/token-editing/approach-6-radial-on-token-sun.html: slot i sits
// at angle -90° + i·45° (0 = top, clockwise), on the token at rest and around it when selected.

const REST_RADIUS = 17;   // px from token centre (sun stays within the ~50px footprint)
const RING_RADIUS = 42;   // px from token centre when expanded

function slotOffset(i, radius) {
  const a = (-90 + i * 45) * (Math.PI / 180);
  return { x: radius * Math.cos(a), y: radius * Math.sin(a) };
}

// Coerce a resolved value to something React can render. Defends against a binding that
// points at an object (e.g. a custom attribute stored as {base,advances,current}, or a
// stale config authored before the key was corrected) — never crash the token.
function displayValue(v) {
  if (v == null) return null;
  if (typeof v === 'object') {
    if ('current' in v) return v.current;
    return null;
  }
  return v;
}

// Reads the live display value for a slot; returns null when there is nothing to show.
function slotValue(slot, character) {
  switch (slot.type) {
    case 'icon': {
      const st = (character.states || []).find(s => s.name === slot.conditionKey);
      return st ? { active: true, level: st.level } : { active: false, level: 0 };
    }
    case 'number': {
      const v = character.tokenOverlay?.[slot.id]?.number;
      return v == null ? null : { value: v };
    }
    case 'field': {
      const { value } = resolveField(character, slot.field);
      const v = displayValue(value);
      return v == null ? null : { value: v };
    }
    case 'select': {
      const v = character.tokenOverlay?.[slot.id]?.select;
      return v ? { value: v } : null;
    }
    default:
      return null;
  }
}

export default function TokenOverlay({ character, config, selected, canEdit, gameId, token }) {
  const { t } = useTranslation();
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();

  const patch = async (path, body) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/characters/${character.id}/${path}`, {
        method: 'PATCH',
        headers: getApiHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
        body: JSON.stringify(body),
      });
    } catch { /* WS refetch will reconcile; ignore transient errors */ }
  };

  // Kill marker — independent of the overlay config: the red strike-through renders whenever
  // the character is dead (even at rest, with the overlay disabled, or on a gridOnly token),
  // while the toggle button only appears on a selected token the viewer can edit.
  const killed = !!character?.killed;
  const toggleKilled = () => canEdit && patch('killed', { killed: !killed });

  // The configurable sun/ring/HP is gated separately from the kill marker above.
  const overlayEnabled = !!config && config.enabled !== false && !character?.gridOnly;

  const slots = overlayEnabled ? (config.slots || []) : [];
  const radius = selected ? RING_RADIUS : REST_RADIUS;

  // ── HP bar ────────────────────────────────────────────────────────────────
  const hp = overlayEnabled && config.hpBar ? resolveField(character, config.hpBar) : null;
  const hpPct = hp && hp.max ? Math.max(0, Math.min(100, (hp.value / hp.max) * 100)) : 0;
  const hpTone = hpPct > 50 ? 'good' : hpPct > 25 ? 'warn' : 'danger';

  const stepHP = (delta) => patch('statField', {
    path: config.hpBar.key,
    delta,
    maxPath: config.hpBar.maxKey || undefined,
    min: 0,
  });

  const bumpState = (slot, delta) => canEdit && patch('state', { conditionKey: slot.conditionKey, delta });
  const stepNumber = (slot, delta) => {
    if (!canEdit) return;
    const cur = character.tokenOverlay?.[slot.id]?.number ?? 0;
    patch('tokenOverlay', { slotId: slot.id, number: cur + delta });
  };
  const cycleSelect = (slot) => {
    if (!canEdit || !(slot.selectOptions || []).length) return;
    const cur = character.tokenOverlay?.[slot.id]?.select;
    const idx = slot.selectOptions.indexOf(cur);
    const next = slot.selectOptions[(idx + 1) % slot.selectOptions.length];
    patch('tokenOverlay', { slotId: slot.id, select: next });
  };

  return (
    <div className={`token-overlay ${selected ? 'token-overlay--selected' : ''} ${killed ? 'token-overlay--killed' : ''}`}>
      {/* Kill strike-through — always visible when dead, independent of the overlay config. */}
      {killed && (
        <div className="token-kill-strike" aria-hidden="true"><span /><span /></div>
      )}

      {/* Kill toggle — only on a selected, editable token; sits on the right equator (3 o'clock). */}
      {selected && canEdit && (
        <button type="button"
          className={`token-kill-toggle ${killed ? 'is-killed' : ''}`}
          style={{ left: '50%', top: '50%', transform: `translate(calc(-50% + ${KILL_TOGGLE_X}px), -50%)` }}
          onClick={(e) => { e.stopPropagation(); toggleKilled(); }}
          onMouseEnter={(e) => showTooltip(t('token.killed'), e.currentTarget)}
          onMouseLeave={hideTooltip}>
          <SkullIcon size={16} />
        </button>
      )}

      {/* HP bar (thin at rest, interactive when selected) */}
      {overlayEnabled && config.hpBar && hp && hp.value != null && (
        <div className={`token-hp ${selected ? 'token-hp--expanded' : ''}`}>
          {selected && canEdit && (
            <button className="token-hp__btn" onClick={(e) => { e.stopPropagation(); stepHP(-1); }}>−</button>
          )}
          <div className="token-hp__track">
            <div className={`token-hp__fill token-hp__fill--${hpTone}`} style={{ width: `${hpPct}%` }} />
            <span className="token-hp__text">{hp.value}{hp.max ? ` / ${hp.max}` : ''}</span>
          </div>
          {selected && canEdit && (
            <button className="token-hp__btn" onClick={(e) => { e.stopPropagation(); stepHP(1); }}>+</button>
          )}
        </div>
      )}

      {/* Ring / sun slots */}
      {slots.map((slot, i) => {
        if (!slot.type || slot.type === 'empty') return null;
        const val = slotValue(slot, character);
        // At rest, only render slots that currently have something to show.
        if (!selected) {
          if (slot.type === 'icon' && !val?.active) return null;
          if (slot.type !== 'icon' && !val) return null;
        }
        const off = slotOffset(i, radius);
        const posStyle = { left: '50%', top: '50%', transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))` };

        if (slot.type === 'icon') {
          const Ico = resolveIcon(slot.icon);
          const active = val?.active;
          const label = slot.conditionLabel || slot.conditionKey;
          return (
            <div key={slot.id}
              className={`token-slot token-slot--icon ${active ? 'is-active' : 'is-inactive'}`}
              style={posStyle}
              onMouseEnter={label ? (e) => showTooltip(label, e.currentTarget) : undefined}
              onMouseLeave={label ? hideTooltip : undefined}
              onClick={(e) => { if (selected) { e.stopPropagation(); bumpState(slot, +1); } }}
              onContextMenu={(e) => { if (!selected) return; e.preventDefault(); e.stopPropagation(); bumpState(slot, -1); }}>
              {Ico ? <Ico sx={{ fontSize: selected ? 14 : 11 }} /> : '?'}
              {active && val.level > 1 && <span className="token-slot__level">{val.level}</span>}
            </div>
          );
        }

        // number / field / select → square-ish chip. The label (number's numberLabel /
        // field's label) is printed under the value on the slot itself.
        const display = val?.value;
        const cap = slot.type === 'number' ? slot.numberLabel
          : slot.type === 'field' ? slot.field?.label : '';
        const showSteppers = selected && canEdit && slot.type === 'number';
        return (
          <div key={slot.id}
            className="token-slot token-slot--num"
            style={posStyle}
            title={cap || ''}
            onClick={(e) => { if (selected && slot.type === 'select') { e.stopPropagation(); cycleSelect(slot); } }}>
            <span className="token-slot__val">{display ?? '–'}</span>
            {cap && <span className="token-slot__cap">{cap}</span>}
            {showSteppers && (
              <div className="token-step">
                <button onClick={(e) => { e.stopPropagation(); stepNumber(slot, +1); }}>▲</button>
                <button onClick={(e) => { e.stopPropagation(); stepNumber(slot, -1); }}>▼</button>
              </div>
            )}
          </div>
        );
      })}

      {/* Squares row (only when selected) */}
      {overlayEnabled && selected && (config.squares || []).length > 0 && (
        <div className="token-squares">
          {config.squares.map((sq) => {
            let value;
            if (sq.type === 'number') value = character.tokenOverlay?.[sq.id]?.number ?? 0;
            else if (sq.type === 'select') value = character.tokenOverlay?.[sq.id]?.select ?? '–';
            else value = displayValue(resolveField(character, sq.field).value) ?? '–';
            return (
              <div key={sq.id} className="token-square"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canEdit) return;
                  if (sq.type === 'select') {
                    const opts = sq.selectOptions || [];
                    if (!opts.length) return;
                    const idx = opts.indexOf(value);
                    patch('tokenOverlay', { slotId: sq.id, select: opts[(idx + 1) % opts.length] });
                  }
                }}>
                <span className="token-square__val">{value}</span>
                {sq.type === 'number' && canEdit && (
                  <div className="token-step token-step--sq">
                    <button onClick={(e) => { e.stopPropagation(); const cur = character.tokenOverlay?.[sq.id]?.number ?? 0; patch('tokenOverlay', { slotId: sq.id, number: cur + 1 }); }}>▲</button>
                    <button onClick={(e) => { e.stopPropagation(); const cur = character.tokenOverlay?.[sq.id]?.number ?? 0; patch('tokenOverlay', { slotId: sq.id, number: cur - 1 }); }}>▼</button>
                  </div>
                )}
                {sq.caption && <span className="token-square__cap">{sq.caption}</span>}
              </div>
            );
          })}
        </div>
      )}

      {tooltipNode}
    </div>
  );
}
