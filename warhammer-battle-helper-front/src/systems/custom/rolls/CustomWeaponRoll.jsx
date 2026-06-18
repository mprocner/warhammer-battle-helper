import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';
import { getResultColor } from '../../../components/log/rollUtils';
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
          <span className="log-list-item__character-name">
            {data.characterName || t('log.character')}
          </span>
          {timestamp && <span className="log-list-item__timestamp">{timestamp}</span>}
        </div>
        <div className="log-list-item__description">
          <strong className="log-list-item__character-name">⚔ {weaponLabel}</strong>{' '}
          <strong className="log-roll-value" style={{ color: resultColor }}>{data.roll}</strong>
          {!isRaw && data.target > 0 && ` ${t('log.vs')} ${data.target}`}
          {!data.formulaBreakdown && modifierText && <span className="log-modifier">{modifierText}</span>}
        </div>
        {data.formulaBreakdown && (
          <div className="log-formula-breakdown">{data.formulaBreakdown}</div>
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
