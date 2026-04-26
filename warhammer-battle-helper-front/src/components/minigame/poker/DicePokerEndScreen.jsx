import React from 'react';
import StyleIcon from '@mui/icons-material/Style';
import DraggablePopup from '../../common/DraggablePopup';

function DicePokerEndScreen({ state, onClose, t }) {
  const { players = [] } = state || {};
  const sorted = [...players].sort((a, b) => (b.roundWins || 0) - (a.roundWins || 0));
  const topWins = sorted[0]?.roundWins || 0;
  const winners = sorted.filter(p => (p.roundWins || 0) === topWins);
  const winnerMsg = winners.length === 1
    ? t('minigames.dicePoker.winner', { name: winners[0].username, wins: topWins })
    : t('minigames.dicePoker.tie', { names: winners.map(w => w.username).join(', ') });

  return (
    <DraggablePopup title={t('minigames.dicePoker.title')} onClose={onClose} initialWidth={500}>
      <div className="poker-board__ended">
        <StyleIcon className="poker-board__ended-icon" />
        <p className="poker-board__ended-msg">{winnerMsg}</p>
        <table className="poker-board__final-scores">
          <tbody>
            {sorted.map((p, i) => (
              <tr key={i}>
                <td>{i + 1}.</td>
                <td>{p.username}</td>
                <td>{p.roundWins || 0} {t('minigames.dicePoker.wins')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="minigame-setup__start-btn" onClick={onClose}>{t('common.close')}</button>
      </div>
    </DraggablePopup>
  );
}

export default DicePokerEndScreen;
