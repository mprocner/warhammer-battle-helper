import React, {useEffect, useRef} from 'react';
import { getApiUrl, getApiHeaders } from '../api/axios';
import SimpleDiceRoll from './log/SimpleDiceRoll';
import AttributeRoll from './log/AttributeRoll';
import SkillRoll from './log/SkillRoll';
import FightResult from './log/FightResult';
import DiceRollControls from './log/DiceRollControls';
import SimpleMessage from './log/SimpleMessage';
import './LogWindow.css';

const LogWindow = ({
    messages = [],
    logs = [],
    maxMessages = 100,
    autoScroll = true,
    addLogMessage,
    gameId = null,
    token = null
}) => {
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
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [trimmedMessages, autoScroll]);

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
        // Check if message has structured data
        if (msg.data && msg.data.rollType) {
            switch (msg.data.rollType) {
                case 'simple':
                    return <SimpleDiceRoll key={index} data={msg.data} timestamp={msg.timestamp} />;
                case 'attribute':
                    return <AttributeRoll key={index} data={msg.data} timestamp={msg.timestamp} />;
                case 'skill':
                    return <SkillRoll key={index} data={msg.data} timestamp={msg.timestamp} />;
                case 'fight':
                    return <FightResult key={index} data={msg.data} />;
                default:
                    break;
            }
        }

        // Fallback for simple text messages
        return <SimpleMessage key={index} text={msg.text} type={msg.type} timestamp={msg.timestamp} />;
    };

    return (
        <div className="log-window">
            <header className="log-window__header">
                <h2 className="log-window__title">Battle Chronicle</h2>
            </header>

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

            <DiceRollControls onRoll={rollDice} />
        </div>
    );
};

export default LogWindow;
