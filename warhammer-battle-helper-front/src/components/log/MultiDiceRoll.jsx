import React from 'react';
import { useTranslation } from 'react-i18next';
import DiceResultToken from './DiceResultToken';
import '../LogWindow.css';

const MultiDiceRoll = ({ data, timestamp }) => {
    const { t } = useTranslation();
    const { count, sides, results = [], sum, username } = data;

    return (
        <div className="log-list-item__content">
            <div className="log-list-item__header">
                <span className="log-list-item__character-name">
                    {username || t('log.character')}
                </span>
                {timestamp && (
                    <span className="log-list-item__timestamp">{timestamp}</span>
                )}
            </div>
            <div className="log-list-item__description">
                {t('log.rolledMultiDice', { count, sides })}
            </div>
            <div className="custom-pool-dice">
                {results.map((result, index) => (
                    <DiceResultToken key={index} result={result} sides={sides} colored={false} />
                ))}
            </div>
            <div className="log-list-item__result">
                {t('log.sum')}: {sum}
            </div>
        </div>
    );
};

export default MultiDiceRoll;
