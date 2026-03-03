import React, {useEffect, useRef} from 'react';
import { getApiUrl, getApiHeaders } from '../api/axios';
import SimpleDiceRoll from './log/SimpleDiceRoll';
import FightResult from './log/FightResult';
import DiceRollControls from './log/DiceRollControls';
import SimpleMessage from './log/SimpleMessage';
import { getSystem } from '../systems/registry';
import './LogWindow.css';

const LogWindow = ({
    messages = [],
    logs = [],
    maxMessages = 100,
    autoScroll = true,
    addLogMessage,
    gameId = null,
    token = null,
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

    const sendMessage = async (text) => {
        try {
            if (gameId && token) {
                const response = await fetch(`${getApiUrl()}/games/${gameId}/message`, {
                    method: 'POST',
                    headers: getApiHeaders({
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }),
                    body: JSON.stringify({ message: text })
                });

                if (!response.ok) {
                    throw new Error('Failed to send message');
                }
            } else {
                addLogMessage(text, 'info');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            addLogMessage('Failed to send message', 'error');
        }
    };

    const rollDice = async (sides) => {
        try {
            if (gameId && token) {
                const response = await fetch(`${getApiUrl()}/games/${gameId}/roll`, {
                    method: 'POST',
                    headers: getApiHeaders({
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }),
                    body: JSON.stringify({ sides })
                });

                if (!response.ok) {
                    throw new Error('Failed to roll dice');
                }
            } else {
                const result = Math.floor(Math.random() * sides) + 1;
                addLogMessage(`Rolled d${sides}: ${result}`, 'success');
            }
        } catch (error) {
            console.error('Error rolling dice:', error);
            addLogMessage('Failed to roll dice', 'error');
        }
    };

    const renderMessage = (msg, index) => {
        if (msg.data && msg.data.rollType) {
            const rollType = msg.data.rollType;

            if (rollType === 'simple') {
                return <SimpleDiceRoll key={index} data={msg.data} timestamp={msg.timestamp} />;
            }
            if (rollType === 'fight') {
                return <FightResult key={index} data={msg.data} />;
            }

            // Dispatch to system plugin for skill/weapon/attribute/sanity rolls
            const RollComponent = system.getRollComponent(rollType);
            if (RollComponent) {
                return <RollComponent key={index} data={msg.data} timestamp={msg.timestamp} />;
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

            <DiceRollControls onRoll={rollDice} onSendMessage={sendMessage} />
        </div>
    );
};

export default LogWindow;
