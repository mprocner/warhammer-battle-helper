import React, { useState } from 'react';
import { getApiUrl, getApiHeaders } from '../../api/axios';
import { resolveIcon } from '../../utils/tokenIcons';
import { resolveField } from '../../utils/tokenFieldResolver';
import { tokenRingGeometry } from '../../utils/tokenRingGeometry';
import TokenRingChrome, { TokenHpBar } from './TokenRingChrome';
import CharacterTokenGearPanel from './CharacterTokenGearPanel';

// TokenOverlay renders a character token's states/HP ring over the shared TokenRingChrome. Three
// viewer classes, one component:
//   - card-less player: `tokenView` (fully-resolved, server-masked) is present → render it verbatim,
//     no blueprint composition, no editing.
//   - GM / card-holder: full `character` + blueprint `config` (+ optional per-token `tokenGear`).
//     Compose blueprint with the per-token overlay; the GM edits live values through the per-token
//     gear endpoints (keyed by placementId), never the removed character.tokenOverlay.
//
// Blueprint = the system's shared token-display config (config.slots[8], config.hpBars[], squares).
// Per-token = tokenGear: SlotOverrides[posId] {slot?, hidden?, value?}, BarOverrides, BarValues, AddedBars.

function displayValue(v) {
  if (v == null) return null;
  if (typeof v === 'object') return 'current' in v ? v.current : null;
  return v;
}

const hpToneOf = (pct) => (pct > 50 ? 'good' : pct > 25 ? 'warn' : 'danger');

// Effective ring slot at position i: blueprint slot, unless a per-token structural override replaces
// it. Returns { slot, hidden, value } where value is the per-token manual TokenOverlayValue (or null).
function effectiveSlotAt(i, blueprintSlots, gear) {
  const bp = blueprintSlots[i];
  const ov = gear?.slotOverrides?.[bp?.id];
  const slot = ov?.slot ?? bp;
  const hidden = ov?.hidden != null ? ov.hidden : !!slot?.defaultHidden;
  return { slot, hidden, value: ov?.value ?? null };
}

export default function TokenOverlay({
  character, config, tokenGear = null, tokenView = null,
  selected, canEdit, isGM = false, sceneId = null, placementId = null, hidden = false,
  gameId, token, gameSystem = null, systemLabel = '', onEditBlueprint = null, width = 50, height = 50,
}) {
  const [gearOpen, setGearOpen] = useState(false);
  // Character-level PATCH (killed / icon-condition state — both card-level, shared across placements).
  const patchChar = async (path, body) => {
    if (!gameId || !token) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/characters/${character.id}/${path}`, {
        method: 'PATCH',
        headers: getApiHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
        body: JSON.stringify(body),
      });
    } catch { /* WS refetch reconciles */ }
  };

  // Per-token gear PATCH (manual slot/bar values — placement-scoped).
  const gearPatch = async (suffix, body, method = 'PATCH') => {
    if (!gameId || !token || !sceneId || !placementId) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/scenes/${sceneId}/tokens/${placementId}/tokenGear/${suffix}`, {
        method,
        headers: getApiHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
        body: JSON.stringify(body),
      });
    } catch { /* WS refetch reconciles */ }
  };

  const killed = !!character?.killed;
  const { radius, equatorX } = tokenRingGeometry(width, height, selected);

  // Whole-token visibility toggle (placement.Hidden) — separate from per-slot visibility.
  const toggleVisibility = async () => {
    if (!gameId || !token || !sceneId) return;
    try {
      await fetch(`${getApiUrl()}/games/${gameId}/scenes/${sceneId}/characters/${character.id}`, {
        method: 'PUT',
        headers: getApiHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
        body: JSON.stringify({ hidden: !hidden }),
      });
    } catch { /* WS refetch reconciles */ }
  };

  // ── Card-less viewer: render the pre-resolved masked projection verbatim ──────────────────
  if (tokenView) {
    const slots = (tokenView.slots || []).map(vs => {
      if (!vs || !vs.slot || vs.slot.type === 'empty') return null;
      const s = vs.slot;
      if (s.type === 'icon') {
        const st = (tokenView.states || []).find(x => x.name === s.conditionKey);
        return {
          id: s.id, variant: 'icon', active: !!st, level: st?.level || 0,
          Icon: resolveIcon(s.icon), label: s.conditionLabel || s.conditionKey,
          onBump: () => {}, showAtRest: !!st,
        };
      }
      const cap = s.type === 'number' ? s.numberLabel : s.type === 'field' ? s.field?.label : '';
      const v = displayValue(vs.value);
      return { id: s.id, variant: 'chip', value: v, cap, showAtRest: v != null };
    });
    return (
      <TokenRingChrome
        selected={selected} canEdit={false} killed={killed}
        radius={radius} equatorX={equatorX}
        killStrikeClassName="token-kill-strike" killToggleClassName="token-kill-toggle"
        slots={slots}
        renderHp={({ showTooltip, hideTooltip }) => (tokenView.bars || []).length > 0 ? (
          <div className={`token-hp-stack ${selected ? 'token-hp-stack--expanded' : ''}`}>
            {tokenView.bars.map(bar => {
              const pct = bar.hideValues ? (bar.pct || 0) : (bar.max ? Math.max(0, Math.min(100, (bar.current / bar.max) * 100)) : 0);
              return (
                <div key={bar.id} className="token-hp">
                  <TokenHpBar current={bar.current} max={bar.max} pct={pct} tone={hpToneOf(pct)} color={bar.color} canEdit={false} onStep={() => {}}
                    label={bar.label} selected={selected} valuesHidden={!!bar.hideValues} showTooltip={showTooltip} hideTooltip={hideTooltip} />
                </div>
              );
            })}
          </div>
        ) : null}
        renderExtras={() => ((tokenView.squares || []).length > 0) ? (
          <div className="token-squares">
            {tokenView.squares.map(sq => (
              <div key={sq.id} className="token-square">
                <span className="token-square__val">{displayValue(sq.value) ?? '–'}</span>
                {sq.caption && <span className="token-square__cap">{sq.caption}</span>}
              </div>
            ))}
          </div>
        ) : null}
      />
    );
  }

  // ── GM / card-holder: compose blueprint + per-token gear, with live editing ───────────────
  const overlayEnabled = !!config && config.enabled !== false;
  const blueprintSlots = config?.slots || [];

  // Manual value editors (per-token, placement-scoped).
  const stepNumber = (slotId, cur, delta) => canEdit && gearPatch(`slots/${slotId}/value`, { number: (cur ?? 0) + delta });
  const setNumber = (slotId, value) => canEdit && gearPatch(`slots/${slotId}/value`, { number: value });
  const cycleSelect = (slotId, opts, cur) => {
    if (!canEdit || !(opts || []).length) return;
    const idx = opts.indexOf(cur);
    gearPatch(`slots/${slotId}/value`, { select: opts[(idx + 1) % opts.length] });
  };
  const bumpState = (slot, delta) => canEdit && patchChar('state', { conditionKey: slot.conditionKey, delta });
  const stepBar = (barId, delta) => canEdit && gearPatch(`bars/${barId}/value`, { delta });

  // Ring slots — 8 fixed positions, effective composition. GM/card-holder see hidden ones too
  // (managing visibility is the gear editor's job; the map token shows the full ring).
  const slots = !overlayEnabled ? [] : Array.from({ length: 8 }, (_, i) => {
    const { slot, value } = effectiveSlotAt(i, blueprintSlots, tokenGear);
    if (!slot || !slot.type || slot.type === 'empty') return null;
    if (slot.type === 'icon') {
      const st = (character.states || []).find(s => s.name === slot.conditionKey);
      return {
        id: slot.id, variant: 'icon', active: !!st, level: st?.level || 0,
        Icon: resolveIcon(slot.icon), label: slot.conditionLabel || slot.conditionKey,
        onBump: (d) => bumpState(slot, d), showAtRest: !!st,
      };
    }
    let v = null;
    if (slot.type === 'field') v = displayValue(resolveField(character, slot.field).value);
    else if (slot.type === 'number') v = value?.number ?? null;
    else if (slot.type === 'select') v = value?.select ?? null;
    const cap = slot.type === 'number' ? slot.numberLabel : slot.type === 'field' ? slot.field?.label : '';
    return {
      id: slot.id, variant: 'chip', value: v, cap, showAtRest: v != null,
      editable: selected && canEdit && slot.type === 'number',
      numberValue: value?.number ?? 0,
      onSetNumber: (n) => setNumber(slot.id, n),
      onStep: (d) => stepNumber(slot.id, value?.number, d),
      onClick: slot.type === 'select' ? () => cycleSelect(slot.id, slot.selectOptions, value?.select) : undefined,
    };
  });

  // Bars = blueprint hpBars (values: field-bound from card, manual from tokenGear.barValues) +
  // per-token AddedBars.
  const barValues = tokenGear?.barValues || {};
  const composedBars = [];
  (config?.hpBars || []).forEach(bar => {
    let current, max;
    if (bar.field) { const r = resolveField(character, bar.field); current = r.value; max = r.max; }
    else { const bv = barValues[bar.id]; current = bv?.current ?? 0; max = bv?.max ?? 0; }
    if (current != null) composedBars.push({ ...bar, current, max, manual: !bar.field });
  });
  (tokenGear?.addedBars || []).forEach(bar => {
    let current, max;
    if (bar.field) { const r = resolveField(character, bar.field); current = r.value; max = r.max; }
    else { const bv = barValues[bar.id]; current = bv?.current ?? 0; max = bv?.max ?? 0; }
    composedBars.push({ ...bar, current, max, manual: !bar.field });
  });

  return (
    <>
    <TokenRingChrome
      selected={selected} canEdit={canEdit} killed={killed}
      radius={radius} equatorX={equatorX}
      killStrikeClassName="token-kill-strike" killToggleClassName="token-kill-toggle"
      onToggleKilled={() => canEdit && patchChar('killed', { killed: !killed })}
      canManageVisibility={isGM} hiddenFromPlayers={hidden}
      onToggleVisibility={toggleVisibility} visibilityToggleClassName="token-visibility-toggle"
      canConfigureGear={isGM && !!placementId && overlayEnabled} onConfigureGear={() => setGearOpen(true)}
      gearToggleClassName="token-gear"
      slots={slots}
      renderHp={({ showTooltip, hideTooltip }) => (overlayEnabled && composedBars.length > 0) ? (
        <div className={`token-hp-stack ${selected ? 'token-hp-stack--expanded' : ''}`}>
          {composedBars.map(bar => {
            const pct = bar.max ? Math.max(0, Math.min(100, (bar.current / bar.max) * 100)) : 0;
            return (
              <div key={bar.id} className="token-hp">
                <TokenHpBar current={bar.current} max={bar.max} pct={pct} tone={hpToneOf(pct)} color={bar.color}
                  canEdit={selected && canEdit && bar.manual} onStep={(d) => stepBar(bar.id, d)}
                  label={bar.label} selected={selected} showTooltip={showTooltip} hideTooltip={hideTooltip} />
              </div>
            );
          })}
        </div>
      ) : null}
      renderExtras={() => (overlayEnabled && selected && (config.squares || []).length > 0) ? (
        <div className="token-squares">
          {config.squares.map((sq) => {
            const ov = tokenGear?.slotOverrides?.[sq.id];
            let value;
            if (sq.type === 'number') value = ov?.value?.number ?? 0;
            else if (sq.type === 'select') value = ov?.value?.select ?? '–';
            else value = displayValue(resolveField(character, sq.field).value) ?? '–';
            return (
              <div key={sq.id} className="token-square"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canEdit) return;
                  if (sq.type === 'select') cycleSelect(sq.id, sq.selectOptions, ov?.value?.select);
                }}>
                <span className="token-square__val">{value}</span>
                {sq.type === 'number' && canEdit && (
                  <div className="token-step token-step--sq">
                    <button onClick={(e) => { e.stopPropagation(); stepNumber(sq.id, ov?.value?.number, 1); }}>▲</button>
                    <button onClick={(e) => { e.stopPropagation(); stepNumber(sq.id, ov?.value?.number, -1); }}>▼</button>
                  </div>
                )}
                {sq.caption && <span className="token-square__cap">{sq.caption}</span>}
              </div>
            );
          })}
        </div>
      ) : null}
    />
    {gearOpen && (
      <CharacterTokenGearPanel
        character={character}
        config={config}
        tokenGear={tokenGear}
        gameId={gameId}
        sceneId={sceneId}
        placementId={placementId}
        gameSystem={gameSystem}
        systemLabel={systemLabel}
        token={token}
        tokenHidden={hidden}
        onEditBlueprint={onEditBlueprint}
        onClose={() => setGearOpen(false)}
      />
    )}
    </>
  );
}
