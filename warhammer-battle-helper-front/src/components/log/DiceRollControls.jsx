import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CasinoOutlinedIcon from '@mui/icons-material/CasinoOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { resolveDisplayName } from '../../utils/participants';
import '../LogWindow.css';

const DEFAULT_DICE = [4, 6, 8, 10, 12, 20, 100];
const MAX_DICE_COUNT = 20;
const MAX_DICE_SIDES = 10000;

const DiceRollControls = ({ onRoll, rollVisibility = 'all', onVisibilityChange, onlyMyRolls = false, onToggleOnlyMyRolls, diceList, participants = [], currentUserId = null }) => {
    const DICE = (Array.isArray(diceList) && diceList.length) ? diceList : DEFAULT_DICE;
    const otherPlayers = participants.filter(p => p.userId && p.userId !== currentUserId);
    const { t } = useTranslation();
    const [isCustomPopupOpen, setIsCustomPopupOpen] = useState(false);
    const [customCount, setCustomCount] = useState('');
    const [customSides, setCustomSides] = useState('');

    const getCustomCount = () => {
        const parsed = parseInt(customCount, 10);
        if (!parsed || parsed < 1) return 1;
        return Math.min(parsed, MAX_DICE_COUNT);
    };

    const handlePresetRoll = (sides) => {
        onRoll(sides, getCustomCount());
    };

    const handleCustomRoll = () => {
        const parsed = parseInt(customSides, 10);
        if (!parsed || parsed < 1) return;
        const sides = Math.min(parsed, MAX_DICE_SIDES);
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
                            max={MAX_DICE_SIDES}
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
                    {otherPlayers.length > 0 && (
                        <optgroup label={t('dice.visibility.playersGroup')}>
                            {otherPlayers.map(p => (
                                <option key={p.userId} value={p.userId}>
                                    {resolveDisplayName(p) || p.username}
                                </option>
                            ))}
                        </optgroup>
                    )}
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
        </div>
    );
};

export default DiceRollControls;
