import React from 'react';
import { useTranslation } from 'react-i18next';
import WaxSealToken from './WaxSealToken';
import { getResultColor, isCriticalSuccess, isCriticalFailure, getTranslatedSkillName } from './rollUtils';
import '../LogWindow.css';

const SkillRoll = ({ data, timestamp }) => {
    const { t } = useTranslation();
    const { outcome, successLevel, roll, target, modifier, characterName, skillKey, skillName: customSkillName } = data;
    // Map backend field names to component variables
    const rollValue = roll;
    const targetValue = target;
    const SL = successLevel;
    const success = outcome !== 'failure' && outcome !== 'fumble';
    const isCritSuccess = isCriticalSuccess(rollValue, success);
    const isCritFailure = isCriticalFailure(rollValue, success);

    const skillName = customSkillName || getTranslatedSkillName(t, skillKey, 'skill');
    const resultColor = getResultColor(isCritSuccess, isCritFailure, success);

    const getResultText = () => {
        if (isCritSuccess) return t('log.criticalSuccess');
        if (isCritFailure) return t('log.fumble');
        return success ? t('log.success') : t('log.failure');
    };

    return (
        <li className="log-list-item">
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
                    <strong className="log-list-item__character-name">{skillName}</strong>
                    {' '}{t('log.test')}: {t('log.rolled')}{' '}
                    <strong className="log-roll-value" style={{ color: resultColor }}>{rollValue}</strong>
                    {' '}{t('log.vs')}{' '}
                    <strong className="log-roll-value" style={{ color: resultColor }}>{targetValue}</strong>
                    {modifier !== 0 && (
                        <span className="log-modifier">
                            {' '}({t('log.modifier')}: {modifier >= 0 ? '+' : ''}{modifier})
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

export default SkillRoll;
