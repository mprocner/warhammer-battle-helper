import React, {useEffect, useRef} from 'react';
import LockIcon from '@mui/icons-material/Lock';
import SimpleMessage from './log/SimpleMessage';
import { getSystem } from '../systems/registry';
import './LogWindow.css';

const LogWindow = ({
    messages = [],
    logs = [],
    maxMessages = 100,
    autoScroll = true,
    gameSystem = 'warhammer4e'
}) => {
    const system = getSystem(gameSystem);
    const logEndRef = useRef(null);

    // Support both 'messages' and 'logs' props
    const allMessages = logs.length > 0
        ? logs.map(log => ({
            text: log.message,
            type: log.type || 'info',
            timestamp: log.timestamp,
            data: log.data
          }))
        : messages;

    const trimmedMessages = allMessages.slice(-maxMessages);

    useEffect(() => {
        if (autoScroll && logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'instant' });
        }
    }, [trimmedMessages, autoScroll]);

    const renderMessage = (msg, index) => {
        if (msg.data && msg.data.rollType) {
            const rollType = msg.data.rollType;
            const isHidden = msg.data.visibility && msg.data.visibility !== 'all';

            const RollComponent = system.getRollComponent(rollType);
            if (RollComponent) {
                return (
                    <li key={index} className={`log-list-item${isHidden ? ' log-entry--hidden-roll' : ''}`}>
                        {isHidden && <LockIcon className="log-entry__lock-icon" fontSize="inherit" />}
                        <RollComponent data={msg.data} timestamp={msg.timestamp} />
                    </li>
                );
            }

            // Unknown rollType for this system — show fallback instead of silently dropping
            const isKnownType = system.supportedRollTypes?.includes(rollType);
            if (!isKnownType) {
                return <SimpleMessage key={index} text={`Roll: ${rollType}`} type="info" timestamp={msg.timestamp} />;
            }
        }

        // Fallback for simple text messages
        const username = msg.data && msg.data.username ? msg.data.username : null;
        return <SimpleMessage key={index} text={msg.text} type={msg.type} timestamp={msg.timestamp} username={username} />;
    };

    return (
        <div className="log-window">
            <div className="log-window__messages">
                {trimmedMessages.length === 0 ? (
                    <div className="log-window__empty">
                        <span className="log-window__empty-text">The chronicle awaits...</span>
                    </div>
                ) : (
                    <ul className="log-window__list">
                        {trimmedMessages.map(renderMessage)}
                        <div ref={logEndRef} />
                    </ul>
                )}
            </div>

        </div>
    );
};

export default LogWindow;
