import React from 'react';
import '../LogWindow.css';

const DiceResultToken = ({ result, sides, colored = true }) => {
    // Determine special roll status (for d100 or any dice)
    const isNatural1 = result === 1;
    const isNatural100 = result === sides && sides >= 100;
    const isLowSpecial = result >= 2 && result <= 5;
    const isHighSpecial = result >= 96 && result <= (sides - 1) && sides >= 100;

    const getTokenClass = () => {
        if (!colored) return 'wax-seal-token--neutral';
        if (isNatural1) return 'wax-seal-token--crit-success';
        if (isNatural100) return 'wax-seal-token--crit-failure';
        if (isLowSpecial) return 'wax-seal-token--success';
        if (isHighSpecial) return 'wax-seal-token--failure';
        return 'wax-seal-token--neutral';
    };

    const textSizeClass = result >= 100 ? 'wax-seal-token--small-text' : 'wax-seal-token--medium-text';

    return (
        <div className={`wax-seal-token ${getTokenClass()} ${textSizeClass}`}>
            {result}
        </div>
    );
};

export default DiceResultToken;
