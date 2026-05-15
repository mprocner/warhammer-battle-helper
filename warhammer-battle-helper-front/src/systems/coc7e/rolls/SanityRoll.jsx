import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';
import { getResultColor } from '../../../components/log/rollUtils';
import '../../../components/LogWindow.css';

function SanityRoll({ data, timestamp }) {
  const { t } = useTranslation();
  const isSuccess = data.outcome === 'regular_success';
  const resultColor = getResultColor(false, !isSuccess, isSuccess);

  return (
    <>
      <WaxSealToken
        symbol={data.roll}
        isCritSuccess={false}
        isCritFailure={!isSuccess}
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
          <strong className="log-list-item__character-name">
            😱 {t('coc.sanityRoll')}
          </strong>
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
          {isSuccess ? t('coc.regularSuccess') : t('coc.failure')}
        </div>

        {data.sanLoss && (
          <div className="log-list-item__damage">
            {t('coc.sanLoss')}: <strong>{data.sanLoss}</strong>
            {data.sanLossResult != null && (
              <> → <strong style={{ color: resultColor }}>{data.sanLossResult}</strong></>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default SanityRoll;
