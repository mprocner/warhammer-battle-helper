import React from 'react';
import { useTranslation } from 'react-i18next';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckIcon from '@mui/icons-material/Check';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useCombat } from '../../../contexts/CombatContext';
import { usePortalTooltip } from '../../common/PortalTooltip';
import { nextTurn, endTurn } from '../../../api/combat';
import { activeEntry } from './combatSelectors';
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
// show here (players do not receive them, and the GM edits them in the window).
export default function CombatStrip({ boundsRef }) {
  const { t } = useTranslation();
  const { combat, isGM, gameId, sceneId, run, stripCollapsed, setWindowOpen } = useCombat();
  const { position, onGripPointerDown, reset, stripRef } = useStripPosition(gameId, boundsRef);
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();
  if (!combat || stripCollapsed) return null;

  const active = activeEntry(combat);
  const style = position ? { left: position.x, top: position.y, transform: 'none' } : undefined;

  return (
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
          <li
            key={entry.id}
            className={itemClass(entry, combat)}
            onMouseEnter={e => showTooltip(entry.name, e.currentTarget)}
            onMouseLeave={hideTooltip}
          >
            <CombatPortrait entry={entry} />
            {entry.hidden && <VisibilityOffIcon className="combat-strip__hidden-icon" />}
          </li>
        ))}
      </ol>
      {isGM && (
        <>
          <button
            type="button"
            className="combat-strip__btn combat-strip__btn--primary"
            onClick={() => run(() => nextTurn(gameId, sceneId, combat.activeId))}
            aria-label={t('combat.next')}
          >
            <ArrowForwardIcon style={{ fontSize: 16 }} />
          </button>
          <button type="button" className="combat-strip__btn" onClick={() => setWindowOpen(true)} aria-label={t('combat.manage')}>
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
  );
}
