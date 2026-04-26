import React from 'react';
import StarIcon from '@mui/icons-material/Star';
import DraggablePopup from '../../common/DraggablePopup';
import YahtzeeDie from '../YahtzeeDie';
import { classifyHand } from '../dicePokerHands';

const EMPTY_DICE = [0, 0, 0, 0, 0];

function DicePokerRevealPhase({ state, revealPhase, isGM, onClose, handleNextRound, endGameButton, confirmOverlay, t }) {
  const { players = [], roundsDone = 0, maxRounds = 5 } = state || {};
  const revealed = revealPhase === 'done';
  const bestRank = revealed
    ? Math.max(...players.map(p => classifyHand(p.dice || EMPTY_DICE).rank))
    : -1;

  return (
    <DraggablePopup
      title={t('minigames.dicePoker.title')}
      onClose={onClose}
      headerButtons={endGameButton}
      initialWidth={700}
    >
      {confirmOverlay}

      <div className={`poker-board__reveal-banner ${revealPhase === 'flipping' ? 'poker-board__reveal-banner--anim' : ''}`}>
        <StarIcon fontSize="small" />
        <span>{t('minigames.dicePoker.revealPhase')}</span>
        <span className="poker-board__reveal-round">
          {t('minigames.dicePoker.roundOf', { n: roundsDone + 1, max: maxRounds })}
        </span>
      </div>

      <div className="poker-board__reveal-rows">
        {players.map((p, idx) => {
          const diceToShow = revealed ? (p.dice || EMPTY_DICE) : EMPTY_DICE;
          const hand = revealed ? classifyHand(p.dice || EMPTY_DICE) : null;
          const isWinner = revealed && hand && hand.rank >= 0 && hand.rank === bestRank;

          return (
            <div
              key={idx}
              className={`poker-board__reveal-row ${isWinner ? 'poker-board__reveal-row--winner' : ''}`}
            >
              <span className="poker-board__reveal-name">{p.username}</span>
              <div className={`poker-board__reveal-dice ${revealPhase === 'flipping' ? 'poker-board__reveal-dice--flipping' : ''}`}>
                {diceToShow.map((val, i) => (
                  <YahtzeeDie key={i} value={val} held={false} canHold={false} />
                ))}
              </div>
              {hand && hand.rank >= 0 && (
                <span className="poker-board__reveal-hand">{t(hand.labelKey)}</span>
              )}
            </div>
          );
        })}
      </div>

      {isGM && revealed && (
        <div className="poker-board__reveal-footer">
          <button className="poker-board__next-round-btn" onClick={handleNextRound}>
            {roundsDone + 1 >= maxRounds
              ? t('minigames.dicePoker.endGame')
              : t('minigames.dicePoker.nextRound')}
          </button>
        </div>
      )}
    </DraggablePopup>
  );
}

export default DicePokerRevealPhase;
