import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';
import { getResultColor } from '../../../components/log/rollUtils';
import TruncatedLabel from '../../../components/log/TruncatedLabel';
import '../../../components/LogWindow.css';

function SanityRoll({ data, timestamp }) {
  const { t } = useTranslation();
  const isSuccess = data.outcome === 'regular_success';
  const resultColor = getResultColor(false, !isSuccess, isSuccess);
  const characterLabel = data.characterName || t('log.character');

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
          <TruncatedLabel text={characterLabel}>
            {characterLabel}
            {data.username && (
              <span style={{ fontWeight: 400 }}> ({data.username})</span>
            )}
          </TruncatedLabel>
          {timestamp && (
            <span className="log-list-item__timestamp">{timestamp}</span>
          )}
        </div>

        <div className="log-list-item__description">
          <TruncatedLabel as="strong" text={`😱 ${t('coc.sanityRoll')}`} />
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
