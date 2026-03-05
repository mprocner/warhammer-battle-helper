import React from 'react';
import '../LogWindow.css';

const WaxSealToken = ({ successLevel, isCritSuccess, isCritFailure, isSuccess, symbol, overrideColor }) => {
    const getTokenClass = () => {
        if (isCritSuccess) return 'wax-seal-token--crit-success';
        if (isCritFailure) return 'wax-seal-token--crit-failure';
        if (isSuccess) return 'wax-seal-token--success';
        return 'wax-seal-token--failure';
    };

    const content = symbol !== undefined
        ? symbol
        : `${successLevel >= 0 ? '+' : ''}${successLevel}`;

    const len = String(content).length;
    const sizeClass = len >= 3 ? 'wax-seal-token--small-text' : len === 2 ? 'wax-seal-token--medium-text' : '';

    return (
        <div
            className={`wax-seal-token ${getTokenClass()} ${sizeClass}`}
            style={overrideColor ? { background: overrideColor } : undefined}
        >
            {content}
        </div>
    );
};

export default WaxSealToken;
