import React from 'react';
import { useTranslation } from 'react-i18next';
import CasinoIcon from '@mui/icons-material/Casino';
import DraggablePopup from '../../common/DraggablePopup';
import { grandTotal } from '../YahtzeeScorecard';

function YahtzeeEndScreen({ state, onClose }) {
  const { t } = useTranslation();
  const { players = [] } = state || {};
  const sorted = [...players].sort((a, b) => grandTotal(b.scores) - grandTotal(a.scores));
  const topScore = grandTotal(sorted[0]?.scores || {});
  const winners = sorted.filter(p => grandTotal(p.scores) === topScore);
  const winnerMsg = winners.length === 1
    ? t('minigames.yahtzee.winner', { name: winners[0].username, score: topScore })
    : t('minigames.yahtzee.tie', { names: winners.map(w => w.username).join(', '), score: topScore });

  return (
    <DraggablePopup
      title={t('minigames.yahtzee.title')}
      onClose={onClose}
      initialWidth={500}
    >
      <div className="yahtzee-board__ended">
        <CasinoIcon className="yahtzee-board__ended-icon" />
        <p className="yahtzee-board__ended-msg">{winnerMsg}</p>
        <table className="yahtzee-board__final-scores">
          <tbody>
            {sorted.map((p, i) => (
              <tr key={i}>
                <td>{i + 1}.</td>
                <td>{p.isNpc ? t('minigames.yahtzee.npcSeat', { n: i + 1 }) : p.username}</td>
                <td>{grandTotal(p.scores)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DraggablePopup>
  );
}

export default YahtzeeEndScreen;
