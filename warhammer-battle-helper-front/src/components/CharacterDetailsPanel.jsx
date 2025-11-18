import React, { useState } from 'react';
import CharacterSheetPopup from './CharacterSheetPopup';

function CharacterDetailsPanel({
    character,
    onAttack,
    onCharacterUpdate,
    modifier,
    onModifierChange
}) {
    const [showDetails, setShowDetails] = useState(false);

    if (!character) {
        return (
            <div className="character-details empty">
                <h2>Select a character</h2>
                <p className="empty-hint">Click on a character in the grid or list to view details</p>
            </div>
        );
    }

    const stats = character.characteristics?.current || {};
    const hp = character.secondaryAttributes?.wounds || {};
    const movement = character.secondaryAttributes?.movement?.current || 4;

    const adjustModifier = (amount) => {
        const newModifier = Math.max(-60, Math.min(60, modifier + amount));
        onModifierChange(newModifier);
    };

    const getModifierClass = () => {
        if (modifier > 0) return 'positive';
        if (modifier < 0) return 'negative';
        return '';
    };

    return (
        <div className="character-details">
            <h2>{character.basicInfo?.name || 'Unknown'}</h2>

            {/* Action Buttons */}
            <div className="action-buttons">
                <button className="action-btn primary" onClick={onAttack} title="Attack">
                    <span className="action-btn-icon">⚔️</span>
                    <span className="action-btn-text">Attack</span>
                </button>
                <button className="action-btn primary" title="Ranged Attack">
                    <span className="action-btn-icon">🏹</span>
                    <span className="action-btn-text">Range Attack</span>
                </button>
                <button className="action-btn secondary" title="Cast Spell">
                    <span className="action-btn-icon">✨</span>
                    <span className="action-btn-text">Cast Spell</span>
                </button>
                <button
                    className="action-btn"
                    onClick={() => setShowDetails(true)}
                    title="Character Card"
                >
                    <span className="action-btn-icon">📜</span>
                    <span className="action-btn-text">Character Card</span>
                </button>
            </div>

            {/* States/Conditions */}
            <div className="states-container">
                <div className="states-label">Conditions</div>
                <div className="states-grid">
                    <div className="state-icon" data-state="prone">
                        <span>🛏️</span>
                        <span className="state-tooltip">Prone</span>
                    </div>
                    <div className="state-icon" data-state="stunned">
                        <span>😵</span>
                        <span className="state-tooltip">Stunned</span>
                    </div>
                    <div className="state-icon" data-state="unconscious">
                        <span>😴</span>
                        <span className="state-tooltip">Unconscious</span>
                    </div>
                    <div className="state-icon" data-state="bleeding">
                        <span>🩸</span>
                        <span className="state-tooltip">Bleeding</span>
                    </div>
                    <div className="state-icon" data-state="poisoned">
                        <span>🧪</span>
                        <span className="state-tooltip">Poisoned</span>
                    </div>
                    <div className="state-icon" data-state="ablaze">
                        <span>🔥</span>
                        <span className="state-tooltip">Ablaze</span>
                    </div>
                </div>
            </div>

            {/* Detail Grid */}
            <div className="detail-grid">
                <div className="detail-item">
                    <div className="detail-label">HP</div>
                    <div className="detail-value">{hp.current || '-'}/{hp.max || '-'}</div>
                </div>
                <div className="detail-item">
                    <div className="detail-label">Movement</div>
                    <div className="detail-value">{movement}</div>
                </div>
                <div className="detail-item">
                    <div className="detail-label">Modifier</div>
                    <div className="modifier-input-container">
                        <button className="modifier-btn" onClick={() => adjustModifier(-10)}>-10</button>
                        <span className={`modifier-value ${getModifierClass()}`}>
                            {modifier > 0 ? '+' : ''}{modifier}
                        </span>
                        <button className="modifier-btn" onClick={() => adjustModifier(10)}>+10</button>
                    </div>
                </div>
            </div>

            {/* Characteristics Mini */}
            <div className="characteristics-mini">
                <div className="char-box">
                    <div className="char-box-label">WS</div>
                    <div className="char-box-value">{stats.WS || '-'}</div>
                </div>
                <div className="char-box">
                    <div className="char-box-label">BS</div>
                    <div className="char-box-value">{stats.BS || '-'}</div>
                </div>
                <div className="char-box">
                    <div className="char-box-label">S</div>
                    <div className="char-box-value">{stats.S || '-'}</div>
                </div>
                <div className="char-box">
                    <div className="char-box-label">T</div>
                    <div className="char-box-value">{stats.T || '-'}</div>
                </div>
                <div className="char-box">
                    <div className="char-box-label">I</div>
                    <div className="char-box-value">{stats.I || '-'}</div>
                </div>
                <div className="char-box">
                    <div className="char-box-label">Ag</div>
                    <div className="char-box-value">{stats.Ag || '-'}</div>
                </div>
                <div className="char-box">
                    <div className="char-box-label">Dex</div>
                    <div className="char-box-value">{stats.Dex || '-'}</div>
                </div>
                <div className="char-box">
                    <div className="char-box-label">Int</div>
                    <div className="char-box-value">{stats.Int || '-'}</div>
                </div>
                <div className="char-box">
                    <div className="char-box-label">WP</div>
                    <div className="char-box-value">{stats.WP || '-'}</div>
                </div>
                <div className="char-box">
                    <div className="char-box-label">Fel</div>
                    <div className="char-box-value">{stats.Fel || '-'}</div>
                </div>
            </div>

            {showDetails && (
                <CharacterSheetPopup
                    character={character}
                    onClose={() => setShowDetails(false)}
                    onCharacterUpdate={onCharacterUpdate}
                />
            )}
        </div>
    );
}

export default CharacterDetailsPanel;