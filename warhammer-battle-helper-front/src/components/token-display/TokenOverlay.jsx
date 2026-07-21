import React from 'react';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { resolveIcon } from '../../utils/tokenIcons';
import { resolveField } from '../../utils/tokenFieldResolver';
import { tokenRingGeometry } from '../../utils/tokenRingGeometry';
import TokenRingChrome, { TokenHpBar } from './TokenRingChrome';

// TokenOverlay is the character-token resolver over the shared TokenRingChrome: it reads live
// values from the character (stats/states via resolveField and character.tokenOverlay), wires the
// character PATCH endpoints, and renders the character-only squares row. All visuals live in the
// chrome, shared with ImageTokenOverlay.

// Coerce a resolved value to something React can render (guards against object-shaped bindings).
function displayValue(v) {
  if (v == null) return null;
  if (typeof v === 'object') return 'current' in v ? v.current : null;
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

export default function TokenOverlay({ character, config, selected, canEdit, gameId, token, width = 50, height = 50 }) {
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

  const killed = !!character?.killed;
  const overlayEnabled = !!config && config.enabled !== false && !character?.gridOnly;
  const { radius, equatorX } = tokenRingGeometry(width, height, selected);

  // HP bar (single, resolved from a stat field).
  const hp = overlayEnabled && config.hpBar ? resolveField(character, config.hpBar) : null;
  const hpPct = hp && hp.max ? Math.max(0, Math.min(100, (hp.value / hp.max) * 100)) : 0;
  const hpTone = hpPct > 50 ? 'good' : hpPct > 25 ? 'warn' : 'danger';
  const stepHP = (delta) => patch('statField', { path: config.hpBar.key, delta, maxPath: config.hpBar.maxKey || undefined, min: 0 });

  const bumpState = (slot, delta) => canEdit && patch('state', { conditionKey: slot.conditionKey, delta });
  const stepNumber = (slot, delta) => {
    if (!canEdit) return;
    const cur = character.tokenOverlay?.[slot.id]?.number ?? 0;
    patch('tokenOverlay', { slotId: slot.id, number: cur + delta });
  };
  const setNumber = (slot, value) => canEdit && patch('tokenOverlay', { slotId: slot.id, number: value });
  const cycleSelect = (slot) => {
    if (!canEdit || !(slot.selectOptions || []).length) return;
    const cur = character.tokenOverlay?.[slot.id]?.select;
    const idx = slot.selectOptions.indexOf(cur);
    patch('tokenOverlay', { slotId: slot.id, select: slot.selectOptions[(idx + 1) % slot.selectOptions.length] });
  };

  // Normalize slots for the chrome, keeping null placeholders so ring positions stay stable.
  const slots = !overlayEnabled ? [] : (config.slots || []).map(slot => {
    if (!slot.type || slot.type === 'empty') return null;
    const val = slotValue(slot, character);
    if (slot.type === 'icon') {
      return {
        id: slot.id, variant: 'icon', active: !!val?.active, level: val?.level || 0,
        Icon: resolveIcon(slot.icon), label: slot.conditionLabel || slot.conditionKey,
        onBump: (d) => bumpState(slot, d), showAtRest: !!val?.active,
      };
    }
    const cap = slot.type === 'number' ? slot.numberLabel : slot.type === 'field' ? slot.field?.label : '';
    return {
      id: slot.id, variant: 'chip', value: val?.value, cap, showAtRest: !!val,
      editable: selected && canEdit && slot.type === 'number',
      numberValue: character.tokenOverlay?.[slot.id]?.number ?? 0,
      onSetNumber: (n) => setNumber(slot, n),
      onStep: (d) => stepNumber(slot, d),
      onClick: slot.type === 'select' ? () => cycleSelect(slot) : undefined,
    };
  });

  return (
    <TokenRingChrome
      selected={selected} canEdit={canEdit} killed={killed}
      radius={radius} equatorX={equatorX}
      killStrikeClassName="token-kill-strike" killToggleClassName="token-kill-toggle"
      onToggleKilled={() => canEdit && patch('killed', { killed: !killed })}
      slots={slots}
      renderHp={() => (overlayEnabled && config.hpBar && hp && hp.value != null) ? (
        <div className={`token-hp ${selected ? 'token-hp--expanded' : ''}`}>
          <TokenHpBar current={hp.value} max={hp.max} pct={hpPct} tone={hpTone} canEdit={selected && canEdit} onStep={stepHP} />
        </div>
      ) : null}
      renderExtras={() => (overlayEnabled && selected && (config.squares || []).length > 0) ? (
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
      ) : null}
    />
  );
}
