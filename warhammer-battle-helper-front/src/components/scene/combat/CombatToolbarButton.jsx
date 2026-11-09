import React from 'react';
import { useTranslation } from 'react-i18next';
import SportsKabaddiIcon from '@mui/icons-material/SportsKabaddi';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useCombat } from '../../../contexts/CombatContext';
import { startCombat } from '../../../api/combat';
import { toolbarState } from './combatSelectors';
import './combat.css';

// The tracker's toggle in the scene tool bar. It is not a mode, so it never takes the filled
// "active mode" look of the tabs before it — its states use a glow and badges instead.
export default function CombatToolbarButton() {
  const { t } = useTranslation();
  const { combat, isGM, gameId, sceneId, run, setWindowOpen, setStripCollapsed } = useCombat();
  const state = toolbarState({ combat, isGM });
  if (state === 'none' || !sceneId) return null;

  const handleClick = () => {
    if (state === 'idle') {
      run(() => startCombat(gameId, sceneId));
      setWindowOpen(true);
      return;
    }
    setStripCollapsed(v => !v);
  };

  return (
    <>
      <span className="drawing-toolbar__separator" aria-hidden="true" />
      <button
        type="button"
        className={`drawing-toolbar__tab combat-toolbar-button combat-toolbar-button--${state}`}
        onClick={handleClick}
        aria-label={t(`combat.toolbar.${state}`)}
      >
        <SportsKabaddiIcon style={{ fontSize: 22 }} />
        {state === 'hidden' && (
          <span className="combat-toolbar-button__badge combat-toolbar-button__badge--icon">
            <VisibilityOffIcon style={{ fontSize: 11 }} />
          </span>
        )}
        {(state === 'live' || state === 'myTurn') && (
          <span className="combat-toolbar-button__badge">{t('combat.roundShort', { round: combat.round })}</span>
        )}
        <span className="drawing-toolbar__tooltip">{t(`combat.toolbar.${state}`)}</span>
      </button>
    </>
  );
}
