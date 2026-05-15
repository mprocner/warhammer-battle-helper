import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';
import { getResultColor } from '../../../components/log/rollUtils';
import '../../../components/LogWindow.css';

const OUTCOME_MAP = {
  critical_success: { isCritSuccess: true,  isCritFailure: false, isSuccess: true,  symbol: '★', label: 'coc.criticalSuccess' },
  extreme_success:  { isCritSuccess: true,  isCritFailure: false, isSuccess: true,  symbol: '◆', label: 'coc.extremeSuccess'  },
  hard_success:     { isCritSuccess: false, isCritFailure: false, isSuccess: true,  symbol: '▲', label: 'coc.hardSuccess'      },
  regular_success:  { isCritSuccess: false, isCritFailure: false, isSuccess: true,  symbol: '●', label: 'coc.regularSuccess'   },
  failure:          { isCritSuccess: false, isCritFailure: false, isSuccess: false, symbol: '✕', label: 'coc.failure'          },
  fumble:           { isCritSuccess: false, isCritFailure: true,  isSuccess: false, symbol: '☠', label: 'coc.fumble'           },
};

function CoCWeaponRoll({ data, timestamp }) {
  const { t } = useTranslation();
  const cfg = OUTCOME_MAP[data.outcome] || OUTCOME_MAP.failure;
  const { isCritSuccess, isCritFailure, isSuccess, label } = cfg;
  const resultColor = getResultColor(isCritSuccess, isCritFailure, isSuccess);

  return (
    <>
      <WaxSealToken
        symbol={data.roll}
        isCritSuccess={isCritSuccess}
        isCritFailure={isCritFailure}
        isSuccess={isSuccess}
        successLevel={0}
      />
      <div className="log-list-item__content">
        <div className="log-list-item__header">
          <span className="log-list-item__character-name">
            {data.characterName || t('log.character')}
            {data.username && (
              <span style={{ fontWeight: 400 }}> ({data.username})</span>
            )}
          </span>
          {timestamp && (
            <span className="log-list-item__timestamp">{timestamp}</span>
          )}
        </div>

        <div className="log-list-item__description">
          <strong className="log-list-item__character-name">⚔ {data.weaponName}</strong>
          {': '}
          <strong className="log-roll-value" style={{ color: resultColor }}>
            {data.roll}
          </strong>
          {' '}{t('log.vs')}{' '}
          <strong className="log-roll-value" style={{ color: resultColor }}>
            {data.target}
          </strong>
        </div>

        <div className="log-list-item__result" style={{ color: resultColor }}>
          {t(label)}
        </div>

        {/* Bonus / Penalty dice summary */}
        {data.allRolls?.length > 1 && (
          <div style={{ fontSize: 13, color: 'var(--log-brown-dark, #5a4a3a)', marginTop: 2 }}>
            {data.diceMod > 0
              ? t('coc.bonusDice', { count: data.diceMod })
              : t('coc.penaltyDice', { count: Math.abs(data.diceMod) })}
            {' · '}
            {t('coc.allRolls')}{': '}
            {data.allRolls.map((r, i) => (
              <span key={i} style={{ fontSize: 15, fontWeight: r === data.roll ? 700 : 400, textDecoration: r === data.roll ? 'underline' : 'none', marginRight: 4 }}>
                {r}
              </span>
            ))}
          </div>
        )}

        {isSuccess && data.damageRoll != null && (
          <div className="log-list-item__damage">
            {t('coc.damage')}: <strong style={{ color: resultColor }}>
              {data.damageBreakdown || data.damageRoll}
            </strong>
          </div>
        )}
      </div>
    </>
  );
}

export default CoCWeaponRoll;
