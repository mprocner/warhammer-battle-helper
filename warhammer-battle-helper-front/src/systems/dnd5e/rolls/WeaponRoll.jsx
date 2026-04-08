import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';
import { getResultColor } from '../../../components/log/rollUtils';
import '../../../components/LogWindow.css';

// D&D 5e attack roll log component.
// data.d20Roll     — raw d20
// data.roll        — total attack roll (d20 + bonus)
// data.target      — target AC (0 = not provided)
// data.outcome     — "critical_hit"|"hit"|"miss"|"critical_miss"|"rolled"
// data.damageRoll  — damage total (on hit)
// data.damageBreakdown — breakdown string e.g. "1d8(5) + 3 = 8"
// data.weaponName
// data.isAdvantage / data.isDisadvantage
// data.allRolls

const OUTCOME_CFG = {
  critical_hit:  { isCritSuccess: true,  isCritFailure: false, isSuccess: true  },
  hit:           { isCritSuccess: false, isCritFailure: false, isSuccess: true  },
  rolled:        { isCritSuccess: false, isCritFailure: false, isSuccess: true  },
  miss:          { isCritSuccess: false, isCritFailure: false, isSuccess: false },
  critical_miss: { isCritSuccess: false, isCritFailure: true,  isSuccess: false },
};

function outcomeLabel(outcome, t) {
  switch (outcome) {
    case 'critical_hit':  return t('dnd.criticalHit');
    case 'hit':           return t('dnd.hit');
    case 'miss':          return t('dnd.miss');
    case 'critical_miss': return t('dnd.criticalMiss');
    default:              return null;
  }
}

function DnD5eWeaponRoll({ data, timestamp }) {
  const { t } = useTranslation();

  const cfg        = OUTCOME_CFG[data.outcome] || OUTCOME_CFG.rolled;
  const { isCritSuccess, isCritFailure, isSuccess } = cfg;
  const resultColor = getResultColor(isCritSuccess, isCritFailure, isSuccess);
  const label       = outcomeLabel(data.outcome, t);

  const bonusPart = data.bonusTotal ?? 0;
  const bonusStr  = bonusPart >= 0 ? `+ ${bonusPart}` : `- ${Math.abs(bonusPart)}`;
  const breakdown = `d20(${data.d20Roll ?? data.roll}) ${bonusStr} = ${data.roll}`;

  const usedDie      = data.d20Roll;
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
        isCritSuccess={isCritSuccess}
        isCritFailure={isCritFailure}
        isSuccess={isSuccess}
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
          <strong className="log-list-item__character-name">⚔ {data.weaponName}</strong>
        </div>

        <div className="dnd-log-roll-breakdown" style={{ color: resultColor }}>
          {breakdown}
          {data.target > 0 && (
            <span style={{ color: 'var(--text-muted)' }}> {t('log.vs')} AC {data.target}</span>
          )}
        </div>

        {label && (
          <div className="log-list-item__result" style={{ color: resultColor }}>
            {label}
          </div>
        )}

        {/* Advantage / disadvantage */}
        {advLabel && discardedDie !== null && (
          <div className="dnd-log-advantage-detail">
            {advLabel}:{' '}
            <span style={{ fontWeight: 700 }}>{usedDie}</span>
            {' / '}
            <span className="dnd-log-advantage-detail__discarded">{discardedDie}</span>
          </div>
        )}

        {/* Damage on hit */}
        {isSuccess && data.outcome !== 'rolled' && data.damageRoll != null && data.damageRoll > 0 && (
          <div className="log-list-item__damage">
            {t('dnd.damage')}: <strong style={{ color: resultColor }}>
              {data.damageBreakdown || data.damageRoll}
            </strong>
            {isCritSuccess && (
              <span className="dnd-log-roll-breakdown--crit"> ({t('dnd.criticalHit')})</span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export default DnD5eWeaponRoll;
