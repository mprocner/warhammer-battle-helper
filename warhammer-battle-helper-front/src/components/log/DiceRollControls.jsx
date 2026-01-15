import React, { useState } from 'react';
import '../LogWindow.css';

const DiceRollControls = ({ onRoll }) => {
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
                <button
                    className="dice-controls__button"
                    onClick={() => onRoll(6)}
                >
                    d6
                </button>
                <button
                    className="dice-controls__button"
                    onClick={() => onRoll(10)}
                >
                    d10
                </button>
                <button
                    className="dice-controls__button"
                    onClick={() => onRoll(100)}
                >
                    d100
                </button>
                <input
                    type="text"
                    className="dice-controls__input"
                    value={customSides}
                    onChange={(e) => setCustomSides(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Custom"
                />
                <button
                    className="dice-controls__button"
                    onClick={handleCustomRoll}
                    disabled={!customSides || parseInt(customSides) <= 0}
                >
                    Roll
                </button>
            </div>
        </div>
    );
};

export default DiceRollControls;
