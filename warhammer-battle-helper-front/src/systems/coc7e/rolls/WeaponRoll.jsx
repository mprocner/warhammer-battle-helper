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
    <li className="log-list-item">
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
          {data.modifier !== 0 && (
            <span className="log-modifier">
              {' '}({t('log.modifier')}: {data.modifier >= 0 ? '+' : ''}{data.modifier})
            </span>
          )}
        </div>

        <div className="log-list-item__result" style={{ color: resultColor }}>
          {t(label)}
        </div>

        {isSuccess && data.damageRoll != null && (
          <div className="log-list-item__damage">
            {t('coc.damage')}: <strong style={{ color: resultColor }}>
              {data.damageBreakdown || data.damageRoll}
            </strong>
          </div>
        )}
      </div>
    </li>
  );
}

export default CoCWeaponRoll;
