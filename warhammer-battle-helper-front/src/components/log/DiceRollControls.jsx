import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CasinoOutlinedIcon from '@mui/icons-material/CasinoOutlined';
import CloseIcon from '@mui/icons-material/Close';
import '../LogWindow.css';

const DICE = [4, 6, 8, 10, 12, 20, 100];
const MAX_DICE_COUNT = 20;

const DiceRollControls = ({ onRoll, onSendMessage, rollVisibility = 'all', onVisibilityChange, onlyMyRolls = false, onToggleOnlyMyRolls }) => {
    const { t } = useTranslation();
    const [chatMessage, setChatMessage] = useState('');
    const [isCustomPopupOpen, setIsCustomPopupOpen] = useState(false);
    const [customCount, setCustomCount] = useState('');
    const [customSides, setCustomSides] = useState('');

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

    const getCustomCount = () => {
        const parsed = parseInt(customCount, 10);
        if (!parsed || parsed < 1) return 1;
        return Math.min(parsed, MAX_DICE_COUNT);
    };

    const handlePresetRoll = (sides) => {
        onRoll(sides, getCustomCount());
    };

    const handleCustomRoll = () => {
        const sides = parseInt(customSides, 10);
        if (!sides || sides < 1) return;
        onRoll(sides, getCustomCount());
        setIsCustomPopupOpen(false);
    };

    const activeCount = getCustomCount();
    const showCountBadge = activeCount > 1;

    return (
        <div className="dice-controls">
            <div className="dice-controls__visibility-row">
                <button
                    type="button"
                    className="dice-controls__dice-toggle"
                    onClick={() => setIsCustomPopupOpen(prev => !prev)}
                >
                    <CasinoOutlinedIcon fontSize="inherit" />
                    {showCountBadge && (
                        <span className="dice-controls__count-badge">×{activeCount}</span>
                    )}
                </button>
                {isCustomPopupOpen && (
                    <div className="dice-controls__custom-popup">
                        <input
                            type="number"
                            min="1"
                            max={MAX_DICE_COUNT}
                            className="dice-controls__custom-popup-input"
                            value={customCount}
                            onChange={e => setCustomCount(e.target.value)}
                            placeholder="1"
                            aria-label={t('dice.numberOfDice')}
                        />
                        <span className="dice-controls__custom-popup-notation">{t('dice.dieNotation')}</span>
                        <input
                            type="number"
                            min="1"
                            className="dice-controls__custom-popup-input"
                            value={customSides}
                            onChange={e => setCustomSides(e.target.value)}
                            placeholder="6"
                            aria-label={t('dice.numberOfSides')}
                        />
                        <button
                            type="button"
                            className="dice-controls__custom-popup-roll"
                            onClick={handleCustomRoll}
                            disabled={!customSides}
                        >
                            {t('dice.roll')}
                        </button>
                        <button
                            type="button"
                            className="dice-controls__custom-popup-close"
                            onClick={() => setIsCustomPopupOpen(false)}
                            aria-label={t('common.close')}
                        >
                            <CloseIcon fontSize="inherit" />
                        </button>
                    </div>
                )}
                <button
                    type="button"
                    className={`dice-controls__my-rolls-toggle${onlyMyRolls ? ' dice-controls__my-rolls-toggle--active' : ''}`}
                    onClick={() => onToggleOnlyMyRolls && onToggleOnlyMyRolls(!onlyMyRolls)}
                    aria-pressed={onlyMyRolls}
                >
                    {t('dice.myRolls')}
                </button>
                <select
                    className="dice-controls__visibility-select"
                    value={rollVisibility}
                    onChange={e => onVisibilityChange && onVisibilityChange(e.target.value)}
                >
                    <option value="all">{t('dice.visibility.all')}</option>
                    <option value="gm_and_roller">{t('dice.visibility.gmAndRoller')}</option>
                    <option value="gm_only">{t('dice.visibility.gmOnly')}</option>
                </select>
            </div>
            <div className="dice-controls__row">
                {DICE.map((sides) => (
                    <button
                        key={sides}
                        className="dice-controls__button"
                        onClick={() => handlePresetRoll(sides)}
                    >
                        {t('dice.label', { sides })}
                        {showCountBadge && (
                            <span className="dice-controls__count-badge">×{activeCount}</span>
                        )}
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
