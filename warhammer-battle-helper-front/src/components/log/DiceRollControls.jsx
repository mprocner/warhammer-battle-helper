import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../LogWindow.css';

const DICE = [4, 6, 8, 10, 12, 20, 100];

const DiceRollControls = ({ onRoll }) => {
    const { t } = useTranslation();
    const [customSides, setCustomSides] = useState('');

    const handleCustomRoll = () => {
        const sides = parseInt(customSides);
        if (sides > 0) {
            onRoll(sides);
            setCustomSides('');
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleCustomRoll();
        }
    };

    return (
        <div className="dice-controls">
            <div className="dice-controls__row">
                {DICE.map((sides) => (
                    <button
                        key={sides}
                        className="dice-controls__button"
                        onClick={() => onRoll(sides)}
                    >
                        {t('dice.label', { sides })}
                    </button>
                ))}
                <input
                    type="text"
                    className="dice-controls__input"
                    value={customSides}
                    onChange={(e) => setCustomSides(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={t('dice.custom')}
                />
                <button
                    className="dice-controls__button"
                    onClick={handleCustomRoll}
                    disabled={!customSides || parseInt(customSides) <= 0}
                >
                    {t('dice.roll')}
                </button>
            </div>
        </div>
    );
};

export default DiceRollControls;
