import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from './WaxSealToken';
import { getResultColor, calculateSuccessLevel, isCriticalSuccess, isCriticalFailure } from './rollUtils';
import '../LogWindow.css';

const AttributeRoll = ({ data, timestamp }) => {
    const { t } = useTranslation();
    const rollValue = data.result;
    const targetValue = data.attributeValue;
    const successLevel = calculateSuccessLevel(rollValue, targetValue);
    const isSuccess = rollValue <= targetValue;
    const isCritSuccess = isCriticalSuccess(rollValue, isSuccess);
    const isCritFailure = isCriticalFailure(rollValue, isSuccess);

    // Translate attribute short name (WS -> WW in Polish, etc.)
    const attributeName = t(`attributeShort.${data.attribute}`, { defaultValue: data.attribute });

    const resultColor = getResultColor(isCritSuccess, isCritFailure, isSuccess);

    const getResultText = () => {
        if (isCritSuccess) return t('log.criticalSuccess');
        if (isCritFailure) return t('log.fumble');
        return isSuccess ? t('log.success') : t('log.failure');
    };

    return (
        <li className="log-list-item">
            <WaxSealToken
                successLevel={successLevel}
                isCritSuccess={isCritSuccess}
                isCritFailure={isCritFailure}
                isSuccess={isSuccess}
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
                    <strong className="log-list-item__character-name">{attributeName}</strong>
                    {' '}{t('log.test')}: {t('log.rolled')}{' '}
                    <strong className="log-roll-value" style={{ color: resultColor }}>{rollValue}</strong>
                    {' '}{t('log.vs')}{' '}
                    <strong className="log-roll-value" style={{ color: resultColor }}>{targetValue}</strong>
                    {data.attributeModifier !== 0 && (
                        <span className="log-modifier">
                            {' '}({t('log.modifier')}: {data.attributeModifier >= 0 ? '+' : ''}{data.attributeModifier})
                        </span>
                    )}
                </div>
                <div className="log-list-item__result" style={{ color: resultColor }}>
                    {getResultText()}
                </div>
            </div>
        </li>
    );
};

export default AttributeRoll;
