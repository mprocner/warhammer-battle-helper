import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';
import { getResultColor } from '../../../components/log/rollUtils';
import '../../../components/LogWindow.css';

// D&D 5e skill roll: ability check, skill check, saving throw, or initiative.
// data.d20Roll  — the raw d20 result (before modifiers)
// data.roll     — the final total (d20 + bonus + modifier)
// data.isAdvantage / data.isDisadvantage
// data.allRolls — both dice when adv/disadv; [chosen, discarded]
// data.skillName — display label (e.g. "Athletics", "Wisdom Saving Throw")
// data.isCriticalHit — natural 20

function DnD5eSkillRoll({ data, timestamp }) {
  const { t } = useTranslation();

  const isNat20  = data.d20Roll === 20;
  const isNat1   = data.d20Roll === 1;
  const isCrit   = isNat20;
  const isFumble = isNat1;

  const resultColor = getResultColor(isCrit, isFumble, !isFumble);

  // Format the roll breakdown string: d20(14) + 3 = 17
  const bonusPart = (data.bonusTotal ?? 0) + (data.modifier ?? 0);
  const bonusStr  = bonusPart >= 0 ? `+ ${bonusPart}` : `- ${Math.abs(bonusPart)}`;
  const breakdown = `d20(${data.d20Roll ?? data.roll}) ${bonusStr} = ${data.roll}`;

  // Figure out which dice were discarded when adv/disadv
  const usedDie     = data.d20Roll;
  const discardedDie = data.allRolls?.length > 1
    ? data.allRolls.find(r => r !== usedDie) ?? data.allRolls[0]
    : null;

  const advLabel = data.isAdvantage
    ? t('dnd.withAdvantage')
    : data.isDisadvantage
      ? t('dnd.withDisadvantage')
      : null;

  return (
    <li className="log-list-item">
      <WaxSealToken
        symbol={data.d20Roll ?? data.roll}
        isCritSuccess={isCrit}
        isCritFailure={isFumble}
        isSuccess={!isFumble}
        successLevel={0}
      />
      <div className="log-list-item__content">
        <div className="log-list-item__header">
          <span className="log-list-item__character-name">
            {data.characterName || t('log.character')}
            {data.username && <span style={{ fontWeight: 400 }}> ({data.username})</span>}
          </span>
          {timestamp && <span className="log-list-item__timestamp">{timestamp}</span>}
        </div>

        <div className="log-list-item__description">
          <strong className="log-list-item__character-name">{data.skillName || data.skillKey}</strong>
        </div>

        <div className="dnd-log-roll-breakdown" style={{ color: resultColor }}>
          {breakdown}
          {isCrit && (
            <span className="dnd-log-roll-breakdown--crit"> — {t('dnd.nat20')}</span>
          )}
          {isFumble && (
            <span style={{ color: 'var(--color-danger, #c0392b)' }}> — {t('dnd.nat1')}</span>
          )}
        </div>

        {/* Advantage / disadvantage: show both dice */}
        {advLabel && discardedDie !== null && (
          <div className="dnd-log-advantage-detail">
            {advLabel}:{' '}
            <span style={{ fontWeight: 700 }}>{usedDie}</span>
            {' / '}
            <span className="dnd-log-advantage-detail__discarded">{discardedDie}</span>
          </div>
        )}
      </div>
    </li>
  );
}

export default DnD5eSkillRoll;
