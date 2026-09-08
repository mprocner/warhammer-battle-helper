import React from 'react';
import { useTranslation } from 'react-i18next';
import DiceResultToken from './DiceResultToken';
import TruncatedLabel from './TruncatedLabel';
import '../LogWindow.css';

const SimpleDiceRoll = ({ data, timestamp }) => {
    const { t } = useTranslation();
    const { result, sides, username } = data;

    return (
        <>
            <DiceResultToken result={result} sides={sides} colored={false} />
            <div className="log-list-item__content">
                <div className="log-list-item__header">
                    <TruncatedLabel text={username || t('log.character')} />
                    {timestamp && (
                        <span className="log-list-item__timestamp">{timestamp}</span>
                    )}
                </div>
                <div className="log-list-item__description">
                    {t('log.rolledDice', { sides, result })}
                </div>
            </div>
        </>
    );
};

export default SimpleDiceRoll;
