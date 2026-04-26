import React from 'react';
import { useTranslation } from 'react-i18next';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import { useDicePokerGame } from './hooks/useDicePokerGame';
import { useGameTurn } from './hooks/useGameTurn';
import DicePokerEndScreen from './poker/DicePokerEndScreen';
import DicePokerRevealPhase from './poker/DicePokerRevealPhase';
import DicePokerRollingPhase from './poker/DicePokerRollingPhase';

function DicePokerBoardModal({ state, gameId, userId, isGM, onClose }) {
  const { t } = useTranslation();
  const { players = [], currentPlayerIdx = 0, phase = 'rolling' } = state || {};
  const { currentPlayer, isMyTurn } = useGameTurn(players, currentPlayerIdx, userId, isGM);

  const pokerGame = useDicePokerGame({ state, gameId, userId, isGM, onClose });

  if (!state) return null;

  const endGameButton = isGM ? (
    <button
      className="modal-header__btn"
      onClick={() => pokerGame.setShowEndConfirm(true)}
      title={t('minigames.dicePoker.endGame')}
    >
      <StopCircleIcon fontSize="small" />
    </button>
  ) : null;

  const confirmOverlay = pokerGame.showEndConfirm ? (
    <div className="yahtzee-board__confirm-overlay">
      <div className="yahtzee-board__confirm">
        <p>{t('minigames.dicePoker.endGameConfirm')}</p>
        <div className="yahtzee-board__confirm-buttons">
          <button className="yahtzee-board__confirm-btn yahtzee-board__confirm-btn--danger" onClick={pokerGame.handleEndGame}>
            {t('minigames.dicePoker.endGame')}
          </button>
          <button className="yahtzee-board__confirm-btn" onClick={() => pokerGame.setShowEndConfirm(false)}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (state.ended) return <DicePokerEndScreen state={state} onClose={onClose} t={t} />;

  if (phase === 'reveal') {
    return (
      <DicePokerRevealPhase
        state={state}
        revealPhase={pokerGame.revealPhase}
        isGM={isGM}
        onClose={onClose}
        handleNextRound={pokerGame.handleNextRound}
        endGameButton={endGameButton}
        confirmOverlay={confirmOverlay}
        t={t}
      />
    );
  }

  return (
    <DicePokerRollingPhase
      state={state}
      gameId={gameId}
      userId={userId}
      isGM={isGM}
      pokerGame={pokerGame}
      isMyTurn={isMyTurn}
      currentPlayer={currentPlayer}
      onClose={onClose}
      endGameButton={endGameButton}
      confirmOverlay={confirmOverlay}
      t={t}
    />
  );
}

export default DicePokerBoardModal;
