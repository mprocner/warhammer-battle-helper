import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';
import { getResultColor } from '../../../components/log/rollUtils';
import TruncatedLabel from '../../../components/log/TruncatedLabel';
import '../../../components/LogWindow.css';

// SRD 5.2 skill roll: ability check, skill check, saving throw, or initiative.
// data.d20Roll  — the raw d20 result (before modifiers)
// data.roll     — the final total (d20 + bonus + modifier)
// data.target   — DC (0 = no DC check)
// data.outcome  — "critical_success"|"success"|"failure"|"critical_failure"|"rolled"
// data.isAdvantage / data.isDisadvantage
// data.allRolls — both dice when adv/disadv; [chosen, discarded]
// data.skillKey — e.g. "skill_athletics", "ability_str", "save_dex", "initiative"

// Translate skillKey to localised display name
function translateSkillKey(skillKey, t) {
  if (skillKey === 'initiative') return t('srd.initiative');
  if (skillKey.startsWith('ability_')) {
    const ability = skillKey.replace('ability_', '');
    return t('srd.abilityCheck', { ability: t('srd.' + ability) });
  }
  if (skillKey.startsWith('save_')) {
    const ability = skillKey.replace('save_', '');
    return t('srd.savingThrowLabel', { ability: t('srd.' + ability) });
  }
  if (skillKey.startsWith('skill_')) {
    const key = skillKey.replace('skill_', '');
    return t('srd.skill_' + key);
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
    case 'critical_success': return t('srd.nat20');
    case 'success':          return t('srd.success');
    case 'failure':          return t('srd.failure');
    case 'critical_failure': return t('srd.nat1');
    default:                 return null;
  }
}

function Srd5SkillRoll({ data, timestamp }) {
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
    ? t('srd.withAdvantage')
    : data.isDisadvantage
      ? t('srd.withDisadvantage')
      : null;

  const characterLabel = data.characterName || t('log.character');

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
          <TruncatedLabel text={characterLabel}>
            {characterLabel}
            {data.username && <span style={{ fontWeight: 400 }}> ({data.username})</span>}
          </TruncatedLabel>
          {timestamp && <span className="log-list-item__timestamp">{timestamp}</span>}
        </div>

        <div className="log-list-item__description">
          <TruncatedLabel as="strong" text={translateSkillKey(data.skillKey, t)} />
        </div>

        <div className="srd-log-roll-breakdown" style={{ color: resultColor }}>
          {breakdown}
          {hasDC && (
            <span style={{ color: 'var(--text-muted)' }}> {t('log.vs')} DC {data.target}</span>
          )}
          {/* No-DC mode: highlight nat 20 / nat 1 inline */}
          {!hasDC && isNat20 && (
            <span className="srd-log-roll-breakdown--crit"> — {t('srd.nat20')}</span>
          )}
          {!hasDC && isNat1 && (
            <span style={{ color: 'var(--color-danger, #c0392b)' }}> — {t('srd.nat1')}</span>
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
          <div className="srd-log-advantage-detail">
            {advLabel}:{' '}
            <span style={{ fontWeight: 700 }}>{usedDie}</span>
            {' / '}
            <span className="srd-log-advantage-detail__discarded">{discardedDie}</span>
          </div>
        )}
      </div>
    </>
  );
}

export default Srd5SkillRoll;
