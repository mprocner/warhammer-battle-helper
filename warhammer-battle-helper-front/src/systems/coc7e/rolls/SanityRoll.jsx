import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';

function SanityRoll({ data, timestamp }) {
  const { t } = useTranslation();
  const isSuccess = data.outcome === 'regular_success';

  return (
    <li className="log-entry log-entry--roll">
      <div className="roll-header">
        <WaxSealToken symbol={isSuccess ? '🧠' : '💀'} color={isSuccess ? '#2ecc71' : '#8e1010'} />
        <div className="roll-info">
          <span className="roll-character">{data.characterName}</span>
          {data.username && <span className="roll-user"> ({data.username})</span>}
        </div>
        {timestamp && <span className="roll-timestamp">{timestamp}</span>}
      </div>

      <div className="roll-body">
        <div className="roll-skill-name">😱 {t('coc.sanityRoll')}</div>

        <div className="roll-dice-line">
          <span className="roll-result">{data.roll}</span>
          <span className="roll-vs"> vs </span>
          <span className="roll-target">{data.target}</span>
        </div>

        {data.sanLoss && (
          <div className="roll-damage">
            {t('coc.sanLoss')}: <strong>{data.sanLoss}</strong>
            {data.sanLossResult != null && (
              <> → <span className="damage-value">{data.sanLossResult}</span></>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export default SanityRoll;
