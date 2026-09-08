import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';
import { getResultColor } from '../../../components/log/rollUtils';
import TruncatedLabel from '../../../components/log/TruncatedLabel';
import { formatPoolFormula } from './poolFormula';
import { MOD_TARGET_ROLL } from '../modifierConfig';
import '../../../components/LogWindow.css';

const OUTCOME_MAP = {
  critical_success: { isCritSuccess: true,  isCritFailure: false, isSuccess: true,  symbol: '★' },
  regular_success:  { isCritSuccess: false, isCritFailure: false, isSuccess: true,  symbol: '●' },
  failure:          { isCritSuccess: false, isCritFailure: false, isSuccess: false, symbol: '✕' },
  fumble:           { isCritSuccess: false, isCritFailure: true,  isSuccess: false, symbol: '☠' },
};

// Weapon roll output for custom systems: an attack roll like a skill roll, plus — when
// the attack succeeds — the damage rolled (CoC-style "damage shown on success").
function CustomWeaponRoll({ data, timestamp }) {
  const { t } = useTranslation();

  const outcome = OUTCOME_MAP[data.outcome];
  const isRaw = !outcome;

  const isCritSuccess = outcome?.isCritSuccess || false;
  const isCritFailure = outcome?.isCritFailure || false;
  const isSuccess     = outcome?.isSuccess     || false;

  const resultColor = isRaw ? 'var(--log-brown-muted)' : getResultColor(isCritSuccess, isCritFailure, isSuccess);

  const weaponLabel = data.weaponName || t('log.weapon');
  const outcomeLabel = isRaw
    ? data.outcome
    : t(`customRoll.${data.outcome}`, { defaultValue: data.outcome });
  const modifierText = data.modifier && data.modifier !== 0
    ? ` (${data.modifier > 0 ? '+' : ''}${data.modifier})`
    : '';

  // Dice-pool weapon attacks carry their formula as poolFormula (formulaBreakdown
  // is left empty by the backend in pool mode); traditional rolls keep formulaBreakdown.
  const formulaText = formatPoolFormula(data.poolFormula, t) || data.formulaBreakdown;

  // Patrz CustomRoll.jsx — tylko target "roll" siedzi już w breakdownie.
  const showsModifierSeparately = !formulaText || data.modifierTarget !== MOD_TARGET_ROLL;

  // FEATURE-162 finding 1 (fix wave 3): mirrors CustomRoll.jsx's isPoolRoll/hasTarget pair.
  // A pool roll with no configured PoolSuccessThreshold sends target 0 ("any die counts" —
  // roller.go's zero default); no die can ever roll 0, so an unset threshold and an explicit
  // "gte 0" read identically and the number carries no information. A non-pool roll's target
  // of 0 is a real, computed value (a fully cancelled skill or attribute) and must still show.
  const isPoolRoll = Boolean(data.poolFormula && data.poolFormula.length);
  const hasTarget = data.target !== undefined && data.target !== null
    && !(isPoolRoll && data.target === 0);

  return (
    <>
      <WaxSealToken
        isCritSuccess={isCritSuccess}
        isCritFailure={isCritFailure}
        isSuccess={isSuccess}
        isNeutral={isRaw}
        symbol={String(data.roll)}
      />
      <div className="log-list-item__content">
        <div className="log-list-item__header">
          <TruncatedLabel text={data.characterName || t('log.character')} />
          {timestamp && <span className="log-list-item__timestamp">{timestamp}</span>}
        </div>
        <div className="log-list-item__description">
          <TruncatedLabel as="strong" text={`⚔ ${weaponLabel}`} />{' '}
          <strong className="log-roll-value" style={{ color: resultColor }}>{data.roll}</strong>
          {/* FEATURE-162: `> 0` hid a negative target (a real, cancelled-out skill total,
              e.g. base 30 with -40 advances). Only null/undefined means "no target",
              except an unconfigured pool threshold (see hasTarget above). */}
          {!isRaw && hasTarget && ` ${t('log.vs')} ${data.target}`}
          {showsModifierSeparately && modifierText && <span className="log-modifier">{modifierText}</span>}
        </div>
        {formulaText && (
          <div className="log-formula-breakdown">{formulaText}</div>
        )}
        {!isRaw && (
          <div className="log-list-item__result" style={{ color: resultColor }}>
            {outcomeLabel}
          </div>
        )}
        {isSuccess && data.damageRoll != null && (
          <div className="log-list-item__damage">
            {t('log.damage')}: <strong style={{ color: resultColor }}>
              {data.damageBreakdown || data.damageRoll}
            </strong>
          </div>
        )}
      </div>
    </>
  );
}

export default CustomWeaponRoll;
