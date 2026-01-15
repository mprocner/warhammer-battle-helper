import React from 'react';
import { useTranslation } from 'react-i18next';
import DiceResultToken from './DiceResultToken';
import '../LogWindow.css';

const SimpleDiceRoll = ({ data, timestamp }) => {
    const { t } = useTranslation();
    const { result, sides, username } = data;

    return (
        <li className="log-list-item">
            <DiceResultToken result={result} sides={sides} />
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
                    {t('log.rolledDice', { sides, result })}
                </div>
            </div>
        </li>
    );
};

export default SimpleDiceRoll;
