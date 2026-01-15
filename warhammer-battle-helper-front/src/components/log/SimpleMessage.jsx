import React from 'react';
import {
    Info as InfoIcon,
    CheckCircle as SuccessIcon,
    Warning as WarningIcon,
    Error as ErrorIcon
} from '@mui/icons-material';
import '../LogWindow.css';

const getMessageIcon = (type) => {
    const iconClass = `log-icon log-icon--${type || 'info'}`;

    switch(type) {
        case 'success':
            return <SuccessIcon className={iconClass} />;
        case 'error':
            return <ErrorIcon className={iconClass} />;
        case 'warning':
            return <WarningIcon className={iconClass} />;
        default:
            return <InfoIcon className={iconClass} />;
    }
};

const getMessageTypeClass = (type) => {
    switch(type) {
        case 'success': return 'log-simple-message--success';
        case 'error': return 'log-simple-message--error';
        case 'warning': return 'log-simple-message--warning';
        default: return 'log-simple-message--info';
    }
};

const SimpleMessage = ({ text, type, timestamp }) => {
    return (
        <li className={`log-simple-message ${getMessageTypeClass(type)}`}>
            <div className="log-simple-message__content">
                {getMessageIcon(type)}
                <div>
                    <div className="log-simple-message__text">{text}</div>
                    {timestamp && (
                        <div className="log-simple-message__timestamp">{timestamp}</div>
                    )}
                </div>
            </div>
        </li>
    );
};

export default SimpleMessage;
