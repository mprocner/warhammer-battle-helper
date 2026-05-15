import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from '../../../components/log/WaxSealToken';
import { getResultColor, isCriticalSuccess, isCriticalFailure } from '../../../components/log/rollUtils';
import '../../../components/LogWindow.css';

const WeaponRoll = ({ data, timestamp }) => {
    const { t } = useTranslation();
    const {
        outcome,
        successLevel,
        roll,
        target,
        modifier,
        characterName,
        weaponName,
        damage: damageFormula,
        damageRoll: damageValue
    } = data;

    // Map backend field names to component variables
    const rollValue = roll;
    const targetValue = target;
    const SL = successLevel;
    const success = outcome !== 'failure' && outcome !== 'fumble';
    const isCritSuccess = isCriticalSuccess(rollValue, success);
    const isCritFailure = isCriticalFailure(rollValue, success);
    const resultColor = getResultColor(isCritSuccess, isCritFailure, success);

    const getResultText = () => {
        if (isCritSuccess) return t('log.criticalSuccess');
        if (isCritFailure) return t('log.fumble');
        return success ? t('log.success') : t('log.failure');
    };

    return (
        <>
            <WaxSealToken
                successLevel={SL}
                isCritSuccess={isCritSuccess}
                isCritFailure={isCritFailure}
                isSuccess={success}
            />
            <div className="log-list-item__content">
                <div className="log-list-item__header">
                    <span className="log-list-item__character-name">
                        {characterName || t('log.character')}
                    </span>
                    {timestamp && (
                        <span className="log-list-item__timestamp">{timestamp}</span>
                    )}
                </div>
                <div className="log-list-item__description">
                    <strong className="log-list-item__character-name">{weaponName}</strong>
                    {' '}{t('log.test')}: {t('log.rolled')}{' '}
                    <strong className="log-roll-value" style={{ color: resultColor }}>{rollValue}</strong>
                    {' '}{t('log.vs')}{' '}
                    <strong className="log-roll-value" style={{ color: resultColor }}>{targetValue}</strong>
                    <span className="log-modifier">
                        {' '}({t('log.modifier')}: {modifier > 0 ? '+' : ''}{modifier})
                    </span>
                </div>
                <div className="log-list-item__result" style={{ color: resultColor }}>
                    {getResultText()}
                </div>
                {success && damageFormula && (
                    <div
                        className="log-list-item__damage"
                        title={`${damageFormula} + ${SL} (SL) = ${damageValue}`}
                    >
                        {t('log.damage')}: <strong>{damageValue}</strong>
                    </div>
                )}
            </div>
        </>
    );
};

export default WeaponRoll;
