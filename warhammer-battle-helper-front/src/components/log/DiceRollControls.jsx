import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../LogWindow.css';

const DICE = [4, 6, 8, 10, 12, 20, 100];

const DiceRollControls = ({ onRoll, onSendMessage }) => {
    const { t } = useTranslation();
    const [chatMessage, setChatMessage] = useState('');

    const handleSendMessage = () => {
        const trimmed = chatMessage.trim();
        if (trimmed) {
            onSendMessage(trimmed);
            setChatMessage('');
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSendMessage();
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
            </div>
            <div className="dice-controls__chat-row">
                <input
                    type="text"
                    className="dice-controls__chat-input"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={t('dice.chatPlaceholder')}
                />
                <button
                    className="dice-controls__send-button"
                    onClick={handleSendMessage}
                    disabled={!chatMessage.trim()}
                >
                    {t('dice.send')}
                </button>
            </div>
        </div>
    );
};

export default DiceRollControls;
