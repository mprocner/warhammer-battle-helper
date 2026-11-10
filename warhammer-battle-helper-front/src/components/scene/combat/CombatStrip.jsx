import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ReplayIcon from '@mui/icons-material/Replay';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckIcon from '@mui/icons-material/Check';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useCombat } from '../../../contexts/CombatContext';
import { usePortalTooltip } from '../../common/PortalTooltip';
import { nextTurn, endTurn, endRound, activateCombatEntry } from '../../../api/combat';
import { activeEntry, allActed } from './combatSelectors';
import useStripPosition from './useStripPosition';
import CombatPortrait from './CombatPortrait';
import './combat.css';

function itemClass(entry, combat) {
  let cls = 'combat-strip__item';
  if (entry.id === combat.activeId) cls += ' combat-strip__item--active';
  if (entry.acted) cls += ' combat-strip__item--acted';
  if (entry.hidden) cls += ' combat-strip__item--hidden';
  return cls;
}

// The turn order over the map, for everyone on the scene. Names show in a tooltip; values never
// show here (players do not receive them, and the GM edits them in the window). For the GM it runs a
// prepared combat on its own: one button steps the turn (or closes the round once everyone has
// acted) and a click on a portrait hands the turn to that participant.
export default function CombatStrip({ mapRef }) {
  const { t } = useTranslation();
  const { combat, isGM, gameId, sceneId, run, stripCollapsed, openWindow } = useCombat();
  const { position, defaultSpot, onGripPointerDown, reset, stripRef } = useStripPosition(gameId, mapRef);
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();
  if (!combat || stripCollapsed) return null;

  const active = activeEntry(combat);
  const roundDone = allActed(combat);
  const tip = (text) => ({ onMouseEnter: e => showTooltip(text, e.currentTarget), onMouseLeave: hideTooltip });
  let style;
  if (position) style = { left: position.x, top: position.y, transform: 'none' };
  else if (defaultSpot) style = { left: defaultSpot.centerX, top: defaultSpot.top };

  // Portaled to <body> so it can sit over the side panels and their toggles, not only the map.
  return createPortal((
    <div ref={stripRef} className={`combat-strip${!combat.visibleToPlayers ? ' combat-strip--hidden' : ''}`} style={style}>
      <button
        type="button"
        className="combat-strip__grip"
        onPointerDown={onGripPointerDown}
        onDoubleClick={reset}
        aria-label={t('combat.strip.move')}
      >
        <DragIndicatorIcon style={{ fontSize: 16 }} />
      </button>
      <span className="combat-strip__round">{t('combat.round', { round: combat.round })}</span>
      {isGM && !combat.visibleToPlayers && <span className="combat-strip__hidden-badge">{t('combat.hiddenBadge')}</span>}
      <ol className="combat-strip__list">
        {combat.entries.map(entry => (
          <li key={entry.id} className={itemClass(entry, combat)} {...tip(isGM ? t('combat.strip.activateTip', { name: entry.name }) : entry.name)}>
            {isGM ? (
              <button
                type="button"
                className="combat-strip__activate"
                onClick={() => run(() => activateCombatEntry(gameId, sceneId, entry.id))}
                aria-label={entry.name}
              >
                <CombatPortrait entry={entry} />
              </button>
            ) : <CombatPortrait entry={entry} />}
            {entry.hidden && <VisibilityOffIcon className="combat-strip__hidden-icon" />}
          </li>
        ))}
      </ol>
      {isGM && (
        <>
          {roundDone ? (
            <button
              type="button"
              className="combat-strip__btn combat-strip__btn--end-round"
              onClick={() => run(() => endRound(gameId, sceneId))}
              aria-label={t('combat.endRound')}
              {...tip(t('combat.strip.endRoundTip', { round: combat.round, next: combat.round + 1 }))}
            >
              <ReplayIcon style={{ fontSize: 16 }} />
            </button>
          ) : (
            <button
              type="button"
              className="combat-strip__btn combat-strip__btn--primary"
              disabled={combat.entries.length === 0}
              onClick={() => run(() => nextTurn(gameId, sceneId, combat.activeId))}
              aria-label={t('combat.next')}
              {...tip(t('combat.strip.nextTip'))}
            >
              <ArrowForwardIcon style={{ fontSize: 16 }} />
            </button>
          )}
          <button type="button" className="combat-strip__btn" onClick={openWindow} aria-label={t('combat.manage')} {...tip(t('combat.manage'))}>
            <SettingsIcon style={{ fontSize: 16 }} />
          </button>
        </>
      )}
      {!isGM && active?.canEndTurn && (
        <button
          type="button"
          className="combat-strip__btn combat-strip__btn--end-turn"
          onClick={() => run(() => endTurn(gameId, sceneId, active.id))}
        >
          <CheckIcon style={{ fontSize: 14 }} />
          {t('combat.endTurn')}
        </button>
      )}
      {tooltipNode}
    </div>
  ), document.body);
}
