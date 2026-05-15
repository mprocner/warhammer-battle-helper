import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';
import { getResultColor } from '../../../components/log/rollUtils';
import '../../../components/LogWindow.css';

// D&D 5e skill roll: ability check, skill check, saving throw, or initiative.
// data.d20Roll  — the raw d20 result (before modifiers)
// data.roll     — the final total (d20 + bonus + modifier)
// data.target   — DC (0 = no DC check)
// data.outcome  — "critical_success"|"success"|"failure"|"critical_failure"|"rolled"
// data.isAdvantage / data.isDisadvantage
// data.allRolls — both dice when adv/disadv; [chosen, discarded]
// data.skillKey — e.g. "skill_athletics", "ability_str", "save_dex", "initiative"

// Translate skillKey to localised display name
function translateSkillKey(skillKey, t) {
  if (skillKey === 'initiative') return t('dnd.initiative');
  if (skillKey.startsWith('ability_')) {
    const ability = skillKey.replace('ability_', '');
    return t('dnd.abilityCheck', { ability: t('dnd.' + ability) });
  }
  if (skillKey.startsWith('save_')) {
    const ability = skillKey.replace('save_', '');
    return t('dnd.savingThrowLabel', { ability: t('dnd.' + ability) });
  }
  if (skillKey.startsWith('skill_')) {
    const key = skillKey.replace('skill_', '');
    return t('dnd.skill_' + key);
  }
  return skillKey;
}

const OUTCOME_CFG = {
  critical_success: { isCritSuccess: true,  isCritFailure: false, isSuccess: true  },
  success:          { isCritSuccess: false, isCritFailure: false, isSuccess: true  },
  rolled:           { isCritSuccess: false, isCritFailure: false, isSuccess: true  },
  failure:          { isCritSuccess: false, isCritFailure: false, isSuccess: false },
  critical_failure: { isCritSuccess: false, isCritFailure: true,  isSuccess: false },
};

function outcomeLabel(outcome, t) {
  switch (outcome) {
    case 'critical_success': return t('dnd.nat20');
    case 'success':          return t('dnd.success');
    case 'failure':          return t('dnd.failure');
    case 'critical_failure': return t('dnd.nat1');
    default:                 return null;
  }
}

function DnD5eSkillRoll({ data, timestamp }) {
  const { t } = useTranslation();

  const isNat20 = data.d20Roll === 20;
  const isNat1  = data.d20Roll === 1;
  const hasDC   = data.target > 0;

  // When DC is present, use backend outcome; otherwise highlight nat 20/1 only
  const cfg = hasDC
    ? (OUTCOME_CFG[data.outcome] || OUTCOME_CFG.rolled)
    : { isCritSuccess: isNat20, isCritFailure: isNat1, isSuccess: !isNat1 };

  const { isCritSuccess, isCritFailure, isSuccess } = cfg;
  const resultColor = getResultColor(isCritSuccess, isCritFailure, isSuccess);
  const label = hasDC ? outcomeLabel(data.outcome, t) : null;

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
    <>
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
          <strong className="log-list-item__character-name">{translateSkillKey(data.skillKey, t)}</strong>
        </div>

        <div className="dnd-log-roll-breakdown" style={{ color: resultColor }}>
          {breakdown}
          {hasDC && (
            <span style={{ color: 'var(--text-muted)' }}> {t('log.vs')} DC {data.target}</span>
          )}
          {/* No-DC mode: highlight nat 20 / nat 1 inline */}
          {!hasDC && isNat20 && (
            <span className="dnd-log-roll-breakdown--crit"> — {t('dnd.nat20')}</span>
          )}
          {!hasDC && isNat1 && (
            <span style={{ color: 'var(--color-danger, #c0392b)' }}> — {t('dnd.nat1')}</span>
          )}
        </div>

        {/* DC mode: show outcome label */}
        {label && (
          <div className="log-list-item__result" style={{ color: resultColor }}>
            {label}
          </div>
        )}

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
    </>
  );
}

export default DnD5eSkillRoll;
