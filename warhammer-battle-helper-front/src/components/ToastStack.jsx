import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import CloseIcon from '@mui/icons-material/Close';
import LockIcon from '@mui/icons-material/Lock';
import { getSystem } from '../systems/registry';
import './ToastStack.css';
import './LogWindow.css';

const OUTCOME_BORDER = {
  critical_success: 'var(--log-gold-medium)',
  extreme_success:  'var(--log-gold-medium)',
  regular_success:  'var(--log-green-medium)',
  hard_success:     'var(--log-green-medium)',
  failure:          'var(--log-red-medium)',
  fumble:           'var(--log-purple-medium)',
};

// Fallback for DICE_ROLLED — no matching roll component in any system
function DiceRollFallback({ data }) {
  const { t } = useTranslation();
  const { characterName, username, roll, diceType } = data;
  const actorName = characterName || username || '???';
  return (
    <>
      <div
        className="wax-seal-token wax-seal-token--neutral"
        style={{ width: 36, height: 36, fontSize: 16, flexShrink: 0 }}
      >
        {roll ?? '?'}
      </div>
      <div className="log-list-item__content">
        <div className="log-list-item__header">
          <span className="log-list-item__character-name">{actorName}</span>
        </div>
        <div className="log-list-item__description">
          {diceType ? `d${diceType}` : t('log.dice', { defaultValue: 'Dice' })}
          {': '}
          <strong className="log-roll-value">{roll}</strong>
        </div>
      </div>
    </>
  );
}

function ToastItem({ toast, onDismiss, onNavigateToLog, gameSystem }) {
  const { id, data, isExiting } = toast;
  const { rollType, outcome, visibility } = data;

  const system  = getSystem(gameSystem);
  const RollComponent = system.getRollComponent(rollType);
  const isGMOnly    = visibility && visibility !== 'all';
  const borderColor = OUTCOME_BORDER[outcome] || 'var(--log-brown-muted)';

  const handleBodyClick = () => {
    onNavigateToLog?.();
    onDismiss(id);
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    onDismiss(id);
  };

  return (
    <div
      className={`toast-stack__item${isExiting ? ' toast-stack__item--exiting' : ''}`}
      style={{ '--toast-border-color': borderColor }}
      onClick={handleBodyClick}
    >
      {/* Reuse the exact same log-list-item tile */}
      <div className="log-list-item toast-stack__log-tile">
        {isGMOnly && <LockIcon className="log-entry__lock-icon" fontSize="inherit" />}
        {RollComponent
          ? <RollComponent data={data} timestamp={null} />
          : <DiceRollFallback data={data} />
        }
      </div>

      <button className="toast-stack__dismiss" onClick={handleDismiss} tabIndex={-1}>
        <CloseIcon fontSize="inherit" />
      </button>

      <div className="toast-stack__progress" />
    </div>
  );
}

function ToastStack({ toasts, onDismiss, onNavigateToLog, onPauseAll, onResumeAll, gameSystem }) {
  const [hovered, setHovered] = useState(false);

  if (toasts.length === 0) return null;

  const handleMouseEnter = () => { setHovered(true);  onPauseAll?.();  };
  const handleMouseLeave = () => { setHovered(false); onResumeAll?.(); };

  return createPortal(
    <div
      className={`toast-stack${hovered ? ' toast-stack--paused' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {toasts.map(toast => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          onNavigateToLog={onNavigateToLog}
          gameSystem={gameSystem}
        />
      ))}
    </div>,
    document.body
  );
}

export default ToastStack;