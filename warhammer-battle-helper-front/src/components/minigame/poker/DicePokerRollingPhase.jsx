import React from 'react';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import CasinoIcon from '@mui/icons-material/Casino';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DraggablePopup from '../../common/DraggablePopup';
import YahtzeeDie from '../YahtzeeDie';

const EMPTY_DICE = [0, 0, 0, 0, 0];

function DicePokerRollingPhase({ state, pokerGame, isMyTurn, currentPlayer, onClose, endGameButton, confirmOverlay, t }) {
  const { players = [], currentPlayerIdx = 0, roundsDone = 0, maxRounds = 5 } = state || {};
  const {
    ownDice,
    ownHeld,
    ownRollsLeft,
    isRolling,
    hasRolled,
    myPlayerIdx,
    handleRoll,
    handleToggleHold,
    handleConfirm,
  } = pokerGame;

  const turnLabel = isMyTurn
    ? t('minigames.yahtzee.yourTurn')
    : t('minigames.yahtzee.waitingFor', { name: currentPlayer?.username || '...' });

  const myPlayer = players[myPlayerIdx];
  const iAlreadyConfirmed = myPlayer?.confirmed;

  const diceForLeftColumn = isMyTurn
    ? ownDice
    : (iAlreadyConfirmed ? ownDice : EMPTY_DICE);

  const otherPlayers = players.filter((_, idx) => idx !== currentPlayerIdx);

  return (
    <DraggablePopup
      title={t('minigames.dicePoker.title')}
      onClose={onClose}
      headerButtons={endGameButton}
      initialWidth={900}
    >
      {confirmOverlay}

      <div className={`yahtzee-board__turn-banner ${!isMyTurn ? 'yahtzee-board__turn-banner--waiting' : ''}`}>
        <span className="yahtzee-board__turn-label">{turnLabel}</span>
        <span className="yahtzee-board__rolls-indicator">
          {[2, 1].map((n, i) =>
            ownRollsLeft <= n
              ? <RadioButtonCheckedIcon key={i} fontSize="small" />
              : <RadioButtonUncheckedIcon key={i} fontSize="small" />
          )}
        </span>
        {hasRolled && isMyTurn && (
          <span className="yahtzee-board__rolls-left">
            {t('minigames.dicePoker.rollsLeft', { count: ownRollsLeft })}
          </span>
        )}
      </div>

      <div className="yahtzee-board__content">
        <div className="yahtzee-board__left">
          <p className="poker-board__section-label">
            {isMyTurn
              ? (currentPlayer?.isNpc
                ? t('minigames.dicePoker.npcDice', { name: currentPlayer.username })
                : t('minigames.dicePoker.yourDice'))
              : (iAlreadyConfirmed
                ? t('minigames.dicePoker.yourDice')
                : t('minigames.dicePoker.waitingToPlay'))}
          </p>

          <div className="yahtzee-board__dice-area">
            {diceForLeftColumn.map((val, i) => (
              <YahtzeeDie
                key={i}
                value={val}
                held={isMyTurn ? ownHeld[i] : false}
                isRolling={isRolling && !ownHeld[i]}
                canHold={isMyTurn && hasRolled && ownRollsLeft > 0}
                onToggleHold={() => handleToggleHold(i)}
              />
            ))}
          </div>

          {isMyTurn && (
            <div className="poker-board__actions">
              {hasRolled && ownRollsLeft > 0 && (
                <p className="yahtzee-board__hold-hint">{t('minigames.dicePoker.holdHint')}</p>
              )}

              <button
                className={`yahtzee-board__roll-btn ${(!hasRolled ? '' : ownRollsLeft <= 0 ? 'yahtzee-board__roll-btn--disabled' : '')}`}
                onClick={handleRoll}
                disabled={ownRollsLeft <= 0 || isRolling}
              >
                <CasinoIcon fontSize="small" />
                {!hasRolled ? t('minigames.dicePoker.roll') : t('minigames.dicePoker.reRoll')}
              </button>

              {hasRolled && (
                <button className="poker-board__confirm-hand-btn" onClick={handleConfirm}>
                  <CheckCircleIcon fontSize="small" />
                  {t('minigames.dicePoker.confirmHand')}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="yahtzee-board__right">
          <div className="poker-board__scores-section">
            <p className="poker-board__round-indicator">
              {t('minigames.dicePoker.roundOf', { n: roundsDone + 1, max: maxRounds })}
            </p>
            {players.map((p, idx) => (
              <div key={idx} className={`poker-board__score-row ${idx === currentPlayerIdx ? 'poker-board__score-row--active' : ''}`}>
                <span className="poker-board__score-name">{p.username}</span>
                <span className="poker-board__score-wins">{p.roundWins || 0}</span>
              </div>
            ))}
          </div>

          {otherPlayers.length > 0 && (
            <div className="poker-board__others-section">
              <p className="poker-board__others-title">{t('minigames.dicePoker.otherPlayers')}</p>
              {otherPlayers.map((p, idx) => (
                <div key={idx} className="poker-board__other-player">
                  <span className="poker-board__other-name">{p.username}</span>
                  <div className="poker-board__other-dice">
                    {EMPTY_DICE.map((_, i) => (
                      <YahtzeeDie key={i} value={0} held={false} canHold={false} />
                    ))}
                  </div>
                  <span className="poker-board__other-status">
                    {p.confirmed
                      ? <CheckCircleIcon fontSize="inherit" className="poker-board__other-status--done" />
                      : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DraggablePopup>
  );
}

export default DicePokerRollingPhase;
