import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import CasinoIcon from '@mui/icons-material/Casino';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import DraggablePopup from '../common/DraggablePopup';
import YahtzeeDie from './YahtzeeDie';
import YahtzeeScorecard from './YahtzeeScorecard';
import YahtzeeEndScreen from './yahtzee/YahtzeeEndScreen';
import { useGameTurn } from './hooks/useGameTurn';
import { rollDice, setHeld, scoreCategory, endMinigame } from '../../api/minigame';

function YahtzeeBoardModal({ state, gameId, userId, isGM, onClose }) {
  const { t } = useTranslation();
  const [isRolling, setIsRolling] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const {
    players = [],
    currentPlayerIdx = 0,
    dice = [1, 1, 1, 1, 1],
    held = [false, false, false, false, false],
    rollsLeft = 3,
  } = state || {};
  const { currentPlayer, isMyTurn } = useGameTurn(players, currentPlayerIdx, userId, isGM);
  const hasRolled = rollsLeft < 3;

  const handleRoll = useCallback(async () => {
    if (!isMyTurn || rollsLeft <= 0 || isRolling) return;
    setIsRolling(true);
    try {
      await rollDice(gameId);
    } catch (e) {
      console.error('Roll failed', e);
    }
    setTimeout(() => setIsRolling(false), 700);
  }, [isMyTurn, rollsLeft, isRolling, gameId]);

  const handleToggleHold = useCallback(async (idx) => {
    if (!isMyTurn || !hasRolled) return;
    const newHeld = [...held];
    newHeld[idx] = !newHeld[idx];
    try {
      await setHeld(gameId, newHeld);
    } catch (e) {
      console.error('SetHeld failed', e);
    }
  }, [isMyTurn, hasRolled, held, gameId]);

  const handleScore = useCallback(async (category) => {
    if (!isMyTurn || !hasRolled) return;
    try {
      await scoreCategory(gameId, category);
    } catch (e) {
      console.error('Score failed', e);
    }
  }, [isMyTurn, hasRolled, gameId]);

  const handleEndGame = useCallback(async () => {
    try {
      await endMinigame(gameId);
    } catch (e) {
      console.error('End game failed', e);
    }
    setShowEndConfirm(false);
    onClose();
  }, [gameId, onClose]);

  if (!state) return null;

  if (state.ended) {
    return <YahtzeeEndScreen state={state} onClose={onClose} />;
  }

  const turnLabel = isMyTurn
    ? t('minigames.yahtzee.yourTurn')
    : t('minigames.yahtzee.waitingFor', { name: currentPlayer?.username || '...' });

  const endGameButton = isGM ? (
    <button
      className="modal-header__btn"
      onClick={() => setShowEndConfirm(true)}
      title={t('minigames.yahtzee.endGame')}
    >
      <StopCircleIcon fontSize="small" />
    </button>
  ) : null;

  return (
    <DraggablePopup
      title={t('minigames.yahtzee.title')}
      onClose={onClose}
      headerButtons={endGameButton}
      initialWidth={900}
    >
      {showEndConfirm && (
        <div className="yahtzee-board__confirm-overlay">
          <div className="yahtzee-board__confirm">
            <p>{t('minigames.yahtzee.endGameConfirm')}</p>
            <div className="yahtzee-board__confirm-buttons">
              <button className="yahtzee-board__confirm-btn yahtzee-board__confirm-btn--danger" onClick={handleEndGame}>
                {t('minigames.yahtzee.endGame')}
              </button>
              <button className="yahtzee-board__confirm-btn" onClick={() => setShowEndConfirm(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`yahtzee-board__turn-banner ${!isMyTurn ? 'yahtzee-board__turn-banner--waiting' : ''}`}>
        <span className="yahtzee-board__turn-label">{turnLabel}</span>
        <span className="yahtzee-board__rolls-indicator">
          {[3, 2, 1].map((n, i) => (
            rollsLeft <= n
              ? <RadioButtonCheckedIcon key={i} fontSize="small" />
              : <RadioButtonUncheckedIcon key={i} fontSize="small" />
          ))}
        </span>
        {hasRolled && (
          <span className="yahtzee-board__rolls-left">
            {t('minigames.yahtzee.rollsLeft', { count: rollsLeft })}
          </span>
        )}
      </div>

      <div className="yahtzee-board__content">
        <div className="yahtzee-board__left">
          <div className="yahtzee-board__dice-area">
            {dice.map((val, i) => (
              <YahtzeeDie
                key={i}
                value={val || 1}
                held={held[i]}
                isRolling={isRolling && !held[i]}
                canHold={isMyTurn && hasRolled && rollsLeft > 0}
                onToggleHold={() => handleToggleHold(i)}
              />
            ))}
          </div>

          {isMyTurn && hasRolled && rollsLeft > 0 && (
            <p className="yahtzee-board__hold-hint">{t('minigames.yahtzee.holdHint')}</p>
          )}

          <button
            className={`yahtzee-board__roll-btn ${(!isMyTurn || rollsLeft <= 0 || isRolling) ? 'yahtzee-board__roll-btn--disabled' : ''}`}
            onClick={handleRoll}
            disabled={!isMyTurn || rollsLeft <= 0 || isRolling}
          >
            <CasinoIcon />
            {!isMyTurn
              ? t('minigames.yahtzee.waitingFor', { name: currentPlayer?.username || '...' })
              : rollsLeft <= 0
                ? 'Choose a category'
                : t('minigames.yahtzee.rollDice')
            }
          </button>
        </div>

        <div className="yahtzee-board__right">
          <YahtzeeScorecard
            players={players}
            currentPlayerIdx={currentPlayerIdx}
            dice={dice}
            rollsLeft={rollsLeft}
            onScore={handleScore}
            myUserId={userId}
          />
        </div>
      </div>
    </DraggablePopup>
  );
}

export default YahtzeeBoardModal;
