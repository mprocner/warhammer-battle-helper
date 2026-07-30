import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';
import { getResultColor } from '../../../components/log/rollUtils';
import { usePortalTooltip } from '../../../components/common/PortalTooltip';
import { flattenPoolDice, formatPoolFormula } from './poolFormula';
import '../../../components/LogWindow.css';

const OUTCOME_MAP = {
  critical_success: { isCritSuccess: true,  isCritFailure: false, isSuccess: true,  symbol: '★' },
  regular_success:  { isCritSuccess: false, isCritFailure: false, isSuccess: true,  symbol: '●' },
  failure:          { isCritSuccess: false, isCritFailure: false, isSuccess: false, symbol: '✕' },
  fumble:           { isCritSuccess: false, isCritFailure: true,  isSuccess: false, symbol: '☠' },
};

function CustomRoll({ data, timestamp }) {
  const { t } = useTranslation();
  const { showTooltip, hideTooltip, tooltipNode } = usePortalTooltip();

  const poolDice = flattenPoolDice(data.poolFormula);
  const poolFormulaText = formatPoolFormula(data.poolFormula, t);

  const outcome = OUTCOME_MAP[data.outcome];
  const isRaw = !outcome;

  const isCritSuccess = outcome?.isCritSuccess || false;
  const isCritFailure = outcome?.isCritFailure || false;
  const isSuccess     = outcome?.isSuccess     || false;
  const symbol        = String(data.roll);

  const resultColor = isRaw ? 'var(--log-brown-muted)' : getResultColor(isCritSuccess, isCritFailure, isSuccess);

  const skillLabel = data.skillName || data.skillKey || '';
  const diceLabel  = data.diceType ? `D${data.diceType}` : '';

  const outcomeLabel = isRaw
    ? data.outcome
    : t(`customRoll.${data.outcome}`, { defaultValue: data.outcome });

  const modifierText = data.modifier && data.modifier !== 0
    ? ` (${data.modifier > 0 ? '+' : ''}${data.modifier})`
    : '';

  // Single source of truth for "a formula is shown": pool formula wins when present,
  // otherwise fall back to the traditional-mode breakdown string.
  const formulaText = poolFormulaText || data.formulaBreakdown;
  const hasFormula = Boolean(formulaText);

  return (
    <>
      <WaxSealToken
        isCritSuccess={isCritSuccess}
        isCritFailure={isCritFailure}
        isSuccess={isSuccess}
        isNeutral={isRaw}
        symbol={symbol}
      />
      <div className="log-list-item__content">
        <div className="log-list-item__header">
          <span className="log-list-item__character-name">
            {data.characterName || t('log.character')}
          </span>
          {timestamp && (
            <span className="log-list-item__timestamp">{timestamp}</span>
          )}
        </div>
        <div className="log-list-item__description">
          {skillLabel && <strong className="log-list-item__character-name">{skillLabel}</strong>}
          {skillLabel && ' '}
          {!hasFormula && diceLabel && <span>{diceLabel}</span>}
          {!hasFormula && diceLabel && ' → '}
          <strong className="log-roll-value" style={{ color: resultColor }}>{data.roll}</strong>
          {!isRaw && data.target > 0 && ` ${t('log.vs')} ${data.target}`}
          {!hasFormula && modifierText && <span className="log-modifier">{modifierText}</span>}
        </div>
        {poolDice.length > 0 && (
          <div className="custom-pool-dice">
            {poolDice.map(({ value, sides }, i) => {
              const dieSucceeded = data.poolSuccessCondition === 'eq'
                ? value === data.target
                : value >= data.target;
              return (
                <span
                  key={i}
                  className={`custom-pool-die${dieSucceeded ? ' custom-pool-die--success' : ''}`}
                  onMouseEnter={e => showTooltip(t('dice.label', { sides }), e.currentTarget)}
                  onMouseLeave={hideTooltip}
                >
                  {value}
                </span>
              );
            })}
            <span className="custom-pool-success-count">
              {t('customRoll.poolSuccesses', { count: data.poolSuccesses })}
            </span>
          </div>
        )}
        {formulaText ? <div className="log-formula-breakdown">{formulaText}</div> : null}
        {!isRaw && (
          <div className="log-list-item__result" style={{ color: resultColor }}>
            {outcomeLabel}
          </div>
        )}
      </div>
      {tooltipNode}
    </>
  );
}

export default CustomRoll;
