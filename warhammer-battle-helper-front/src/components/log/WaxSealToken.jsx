import React from 'react';
import '../LogWindow.css';

const WaxSealToken = ({ successLevel, isCritSuccess, isCritFailure, isSuccess }) => {
    const getTokenClass = () => {
        if (isCritSuccess) return 'wax-seal-token--crit-success';
        if (isCritFailure) return 'wax-seal-token--crit-failure';
        if (isSuccess) return 'wax-seal-token--success';
        return 'wax-seal-token--failure';
    };

    return (
        <div className={`wax-seal-token ${getTokenClass()}`}>
            {successLevel >= 0 ? '+' : ''}{successLevel}
        </div>
    );
};

export default WaxSealToken;
