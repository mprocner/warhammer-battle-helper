import React from 'react';
import { useTranslation } from 'react-i18next';

const UPPER_CATEGORIES = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
const LOWER_CATEGORIES = ['threeOfAKind', 'fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yahtzee', 'chance'];

function computePreview(category, dice) {
  if (!dice || !dice.some(d => d > 0)) return null;
  const counts = Array(7).fill(0);
  let sum = 0;
  dice.forEach(d => { counts[d]++; sum += d; });

  switch (category) {
    case 'ones': return counts[1] * 1;
    case 'twos': return counts[2] * 2;
    case 'threes': return counts[3] * 3;
    case 'fours': return counts[4] * 4;
    case 'fives': return counts[5] * 5;
    case 'sixes': return counts[6] * 6;
    case 'threeOfAKind': return counts.some(c => c >= 3) ? sum : 0;
    case 'fourOfAKind': return counts.some(c => c >= 4) ? sum : 0;
    case 'fullHouse': return (counts.some(c => c === 3) && counts.some(c => c === 2)) ? 25 : 0;
    case 'smallStraight': {
      const straights = [[1,2,3,4],[2,3,4,5],[3,4,5,6]];
      return straights.some(s => s.every(v => counts[v] > 0)) ? 30 : 0;
    }
    case 'largeStraight': {
      const ls1 = [1,2,3,4,5].every(v => counts[v] > 0);
      const ls2 = [2,3,4,5,6].every(v => counts[v] > 0);
      return (ls1 || ls2) ? 40 : 0;
    }
    case 'yahtzee': return counts.some(c => c === 5) ? 50 : 0;
    case 'chance': return sum;
    default: return null;
  }
}

function upperSubtotal(scores) {
  let total = 0;
  UPPER_CATEGORIES.forEach(cat => {
    if (scores[cat] != null) total += scores[cat];
  });
  return total;
}

function grandTotal(scores) {
  let total = upperSubtotal(scores);
  if (total >= 63) total += 35;
  LOWER_CATEGORIES.forEach(cat => {
    if (scores[cat] != null) total += scores[cat];
  });
  return total;
}

function ScoreCell({ score, isAvailable, preview, onScore }) {
  if (score != null) {
    return <td className="yahtzee-score__cell yahtzee-score__cell--scored">{score}</td>;
  }
  if (isAvailable) {
    return (
      <td
        className="yahtzee-score__cell yahtzee-score__cell--available"
        onClick={onScore}
        title={`Score: ${preview ?? '?'}`}
      >
        {preview != null ? <span className="yahtzee-score__preview">{preview}</span> : '—'}
      </td>
    );
  }
  return <td className="yahtzee-score__cell">—</td>;
}

function YahtzeeScorecard({ players, currentPlayerIdx, dice, rollsLeft, onScore, myUserId }) {
  const { t } = useTranslation();
  const canScore = rollsLeft < 3;

  return (
    <div className="yahtzee-score__wrapper">
      <table className="yahtzee-score">
        <thead>
          <tr>
            <th className="yahtzee-score__category-header">{t('minigames.categories.header')}</th>
            {players.map((p, i) => (
              <th
                key={i}
                className={`yahtzee-score__player-header ${i === currentPlayerIdx ? 'yahtzee-score__player-header--active' : ''}`}
              >
                {p.isNpc ? t('minigames.yahtzee.npcSeat', { n: i + 1 }) : p.username}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="yahtzee-score__section-header">
            <td colSpan={players.length + 1}>{t('minigames.categories.upperSection')}</td>
          </tr>
          {UPPER_CATEGORIES.map(cat => (
            <tr key={cat}>
              <td className="yahtzee-score__label">{t(`minigames.categories.${cat}`)}</td>
              {players.map((p, i) => {
                const isCurrentPlayer = i === currentPlayerIdx;
                const meIsCurrentPlayer = p.userId === myUserId && isCurrentPlayer;
                const npcIsCurrentPlayer = p.isNpc && isCurrentPlayer;
                const available = canScore && (meIsCurrentPlayer || npcIsCurrentPlayer) && p.scores[cat] == null;
                return (
                  <ScoreCell
                    key={i}
                    score={p.scores[cat]}
                    isAvailable={available}
                    preview={available ? computePreview(cat, dice) : null}
                    onScore={() => onScore(cat)}
                  />
                );
              })}
            </tr>
          ))}
          <tr className="yahtzee-score__subtotal">
            <td className="yahtzee-score__label">{t('minigames.categories.subtotal')}</td>
            {players.map((p, i) => (
              <td key={i} className="yahtzee-score__cell yahtzee-score__cell--subtotal">
                {upperSubtotal(p.scores)}
              </td>
            ))}
          </tr>
          <tr className="yahtzee-score__subtotal">
            <td className="yahtzee-score__label">{t('minigames.categories.bonus')}</td>
            {players.map((p, i) => {
              const sub = upperSubtotal(p.scores);
              return (
                <td key={i} className="yahtzee-score__cell yahtzee-score__cell--subtotal">
                  {sub >= 63 ? '+35' : `(${sub}/63)`}
                </td>
              );
            })}
          </tr>

          <tr className="yahtzee-score__section-header">
            <td colSpan={players.length + 1}>{t('minigames.categories.lowerSection')}</td>
          </tr>
          {LOWER_CATEGORIES.map(cat => (
            <tr key={cat}>
              <td className="yahtzee-score__label">{t(`minigames.categories.${cat}`)}</td>
              {players.map((p, i) => {
                const isCurrentPlayer = i === currentPlayerIdx;
                const meIsCurrentPlayer = p.userId === myUserId && isCurrentPlayer;
                const npcIsCurrentPlayer = p.isNpc && isCurrentPlayer;
                const available = canScore && (meIsCurrentPlayer || npcIsCurrentPlayer) && p.scores[cat] == null;
                return (
                  <ScoreCell
                    key={i}
                    score={p.scores[cat]}
                    isAvailable={available}
                    preview={available ? computePreview(cat, dice) : null}
                    onScore={() => onScore(cat)}
                  />
                );
              })}
            </tr>
          ))}

          <tr className="yahtzee-score__total">
            <td className="yahtzee-score__label">{t('minigames.categories.total')}</td>
            {players.map((p, i) => (
              <td key={i} className="yahtzee-score__cell yahtzee-score__cell--total">
                {grandTotal(p.scores)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export { grandTotal };
export default YahtzeeScorecard;
