import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingsIcon from '@mui/icons-material/Settings';
import { resolveIcon } from '../../utils/tokenIcons';
import { patchSceneImageTokenHP, patchSceneImageTokenSlot, updateSceneImage } from '../../api/scenes';
import { tokenRingGeometry } from '../../utils/tokenRingGeometry';
import ImageTokenConfigPanel from './ImageTokenConfigPanel';
import TokenRingChrome, { TokenHpBar } from './TokenRingChrome';

const MAX_SLOTS = 8; // ring positions
const HP_CLEAR = 16; // HP stack's bottom edge sits this far beyond the top ring slot

function hpTone(pct) {
  return pct > 50 ? 'good' : pct > 25 ? 'warn' : 'danger';
}

// ImageTokenOverlay is the scene-image resolver over the shared TokenRingChrome. Unlike the
// character overlay it reads live values straight off the overlay object (slot.level / slot.number
// / bar.current) and mutates via the scene-image endpoints. It adds a config gear + panel and
// supports multiple stacked HP bars.
export default function ImageTokenOverlay({ image, gameId, sceneId, selected, canEdit, gameSystem }) {
  const { t } = useTranslation();
  const [configOpen, setConfigOpen] = useState(false);

  const overlay = image?.tokenOverlay;
  const enabled = !!overlay && overlay.enabled !== false;
  // A whole-bar-hidden bar is masked to max 0 (filtered out); a numbers-hidden bar also arrives with
  // max 0 but must still render (its fill comes from the baked pct), so keep it via hideValues.
  const bars = enabled ? (overlay.hpBars || []).filter(b => Number(b.max) > 0 || b.hideValues) : [];
  const rawSlots = enabled ? (overlay.slots || []).slice(0, MAX_SLOTS) : [];

  const { radius, equatorX } = tokenRingGeometry(image?.width, image?.height, selected);
  const hpTransform = `translate(-50%, calc(-100% - ${radius + HP_CLEAR}px))`;

  const stepHP = (barId, delta) => { if (canEdit) patchSceneImageTokenHP(gameId, sceneId, image.id, { barId, delta }).catch(() => {}); };
  const bumpSlot = (slotId, delta) => { if (canEdit) patchSceneImageTokenSlot(gameId, sceneId, image.id, { slotId, delta }).catch(() => {}); };
  const setSlotNumber = (slotId, number) => { if (canEdit) patchSceneImageTokenSlot(gameId, sceneId, image.id, { slotId, number }).catch(() => {}); };

  const killed = !!image?.killed;
  const hiddenFromPlayers = !!image?.hidden;
  const toggleVisibility = () => {
    if (canEdit) updateSceneImage(gameId, sceneId, image.id, { hidden: !hiddenFromPlayers }).catch(() => {});
  };

  // Nothing to draw and not selected: a bare, unconfigured tokens-layer image. Still render when
  // killed, when selected+GM (gear/skull reachable), or while the config popup is open.
  const hasContent = bars.length > 0 || rawSlots.some(s => s.type && s.type !== 'empty');
  if (!hasContent && !killed && !(selected && canEdit) && !configOpen) return null;

  // Normalize slots for the chrome, keeping null placeholders so ring positions stay stable.
  const slots = rawSlots.map(slot => {
    if (!slot.type || slot.type === 'empty') return null;
    if (slot.type === 'icon') {
      const active = (slot.level || 0) > 0;
      return {
        id: slot.id, variant: 'icon', active, level: slot.level || 0,
        Icon: resolveIcon(slot.icon), label: slot.conditionLabel || slot.conditionKey,
        onBump: (d) => bumpSlot(slot.id, d), showAtRest: active,
      };
    }
    return {
      id: slot.id, variant: 'chip', value: slot.number ?? 0, cap: slot.numberLabel,
      showAtRest: slot.number != null,
      editable: selected && canEdit,
      numberValue: slot.number ?? 0,
      onSetNumber: (n) => setSlotNumber(slot.id, n),
      onStep: (d) => setSlotNumber(slot.id, (slot.number ?? 0) + d),
    };
  });

  return (
    <TokenRingChrome
      extraClassName="img-token-overlay"
      stopContainerEvents
      selected={selected} canEdit={canEdit} killed={killed}
      radius={radius} equatorX={equatorX}
      killStrikeClassName="img-token-kill-strike" killToggleClassName="img-token-kill-toggle"
      onToggleKilled={() => { if (canEdit) updateSceneImage(gameId, sceneId, image.id, { killed: !killed }).catch(() => {}); }}
      canManageVisibility={canEdit} hiddenFromPlayers={hiddenFromPlayers}
      onToggleVisibility={toggleVisibility} visibilityToggleClassName="img-token-visibility-toggle"
      slots={slots}
      renderHp={({ showTooltip, hideTooltip }) => bars.length > 0 ? (
        <div className={`img-token-hp-stack ${selected ? 'img-token-hp-stack--expanded' : ''}`} style={{ transform: hpTransform }}>
          {bars.map(bar => {
            // GM (canEdit) always sees the real numbers even when hideValues is set on the config;
            // only the masked player payload carries the zeroed current/max + baked pct.
            const valuesHidden = !!bar.hideValues && !canEdit;
            const pct = bar.hideValues && !canEdit ? (bar.pct || 0) : (bar.max ? Math.max(0, Math.min(100, (bar.current / bar.max) * 100)) : 0);
            return (
              <div key={bar.id} className="img-token-hp">
                <TokenHpBar current={bar.current} max={bar.max} pct={pct} tone={hpTone(pct)} color={bar.color}
                  canEdit={selected && canEdit} onStep={(d) => stepHP(bar.id, d)}
                  label={bar.label} selected={selected} valuesHidden={valuesHidden} showTooltip={showTooltip} hideTooltip={hideTooltip} />
              </div>
            );
          })}
        </div>
      ) : null}
      renderExtras={({ showTooltip, hideTooltip }) => (
        <>
          {/* Config gear — GM only, left equator (9 o'clock), opposite the kill toggle. */}
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
            <ImageTokenConfigPanel image={image} gameId={gameId} sceneId={sceneId} gameSystem={gameSystem} onClose={() => setConfigOpen(false)} />
          )}
        </>
      )}
    />
  );
}
