import React, { useState } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { startMinigame } from '../../../api/minigame';
import { resolveDisplayName } from '../../../utils/participants';

function MinigameSetup({ selectedGame, gameId, onlinePlayers, userId, onBack, onStarted, t }) {
  const initialMaxRounds = selectedGame === 'dicepoker' ? 5 : 13;
  const maxRoundsLimit = selectedGame === 'dicepoker' ? 20 : 13;

  const [gmSeats, setGmSeats] = useState(0);
  const [maxRounds, setMaxRounds] = useState(initialMaxRounds);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
  const [npcNames, setNpcNames] = useState(['', '', '', '']);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const totalPlayers = selectedPlayerIds.length + (gmSeats || 0);

  const handleTogglePlayer = (pid) => {
    setSelectedPlayerIds(prev =>
      prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]
    );
  };

  const handleStart = async () => {
    if (totalPlayers < 2) return;
    setStarting(true);
    setError(null);
    try {
      const players = [];
      selectedPlayerIds.forEach(pid => {
        const p = onlinePlayers.find(op => op.userId === pid);
        if (p) players.push({ userId: p.userId, username: resolveDisplayName(p) || p.userId, isNpc: false });
      });
      for (let i = 0; i < gmSeats; i++) {
        const name = npcNames[i]?.trim() || t('minigames.setup.npcSeat', { n: i + 1 });
        players.push({ userId: '', username: name, isNpc: true });
      }
      await startMinigame(gameId, selectedGame, players, maxRounds);
      onStarted();
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to start game');
    }
    setStarting(false);
  };

  return (
    <div className="minigame-setup">
      <button className="minigame-setup__back-btn" onClick={onBack}>
        <ArrowBackIcon fontSize="small" />
        {t('minigames.setup.backToList')}
      </button>
      <h3 className="minigame-setup__title">
        {selectedGame === 'dicepoker' ? t('minigames.dicePoker.title') : t('minigames.yahtzee.title')}
      </h3>

      <div className="minigame-setup__section">
        <p className="minigame-setup__label">{t('minigames.setup.selectPlayers')}</p>
        <div className="minigame-setup__player-list">
          {onlinePlayers.map(p => {
            const isMe = p.userId === userId;
            const checked = selectedPlayerIds.includes(p.userId);
            return (
              <label
                key={p.userId}
                className={`minigame-setup__player-row ${isMe ? 'minigame-setup__player-row--gm' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleTogglePlayer(p.userId)}
                />
                <span>{resolveDisplayName(p) || p.userId}</span>
                {isMe && <span className="minigame-setup__gm-badge">GM</span>}
              </label>
            );
          })}
        </div>
      </div>

      <div className="minigame-setup__section">
        <label className="minigame-setup__label" htmlFor="gm-seats">
          {t('minigames.setup.gmSeats')}
        </label>
        <input
          id="gm-seats"
          className="minigame-setup__seats-input"
          type="number"
          min={0}
          max={4}
          value={gmSeats}
          onChange={e => setGmSeats(Math.max(0, Math.min(4, parseInt(e.target.value) || 0)))}
        />
        <p className="minigame-setup__hint">{t('minigames.setup.gmSeatsHint')}</p>
      </div>

      {gmSeats > 0 && (
        <div className="minigame-setup__section">
          <p className="minigame-setup__label">{t('minigames.setup.npcNames')}</p>
          {Array.from({ length: gmSeats }, (_, i) => (
            <div key={i} className="minigame-setup__npc-name-row">
              <label htmlFor={`npc-name-${i}`} className="minigame-setup__npc-name-label">
                {t('minigames.setup.npcName', { n: i + 1 })}
              </label>
              <input
                id={`npc-name-${i}`}
                type="text"
                className="minigame-setup__npc-name-input"
                value={npcNames[i] || ''}
                placeholder={t('minigames.setup.npcNamePlaceholder', { n: i + 1 })}
                onChange={e => {
                  const updated = [...npcNames];
                  updated[i] = e.target.value;
                  setNpcNames(updated);
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div className="minigame-setup__section">
        <label className="minigame-setup__label" htmlFor="max-rounds">
          {t('minigames.setup.rounds')}
        </label>
        <input
          id="max-rounds"
          className="minigame-setup__seats-input"
          type="number"
          min={1}
          max={maxRoundsLimit}
          value={maxRounds}
          onChange={e => setMaxRounds(Math.max(1, Math.min(maxRoundsLimit, parseInt(e.target.value) || maxRoundsLimit)))}
        />
        <p className="minigame-setup__hint">
          {selectedGame === 'dicepoker'
            ? t('minigames.setup.roundsHintPoker')
            : t('minigames.setup.roundsHint')}
        </p>
      </div>

      <p className="minigame-setup__total">
        {t('minigames.setup.totalSeats')}: <strong>{totalPlayers}</strong>
      </p>

      {error && <p className="minigame-setup__error">{error}</p>}

      <button
        className={`minigame-setup__start-btn ${totalPlayers < 2 ? 'minigame-setup__start-btn--disabled' : ''}`}
        onClick={handleStart}
        disabled={totalPlayers < 2 || starting}
      >
        {starting ? t('common.loading') : t('minigames.setup.startGame')}
      </button>
      {totalPlayers < 2 && (
        <p className="minigame-setup__min-warning">{t('minigames.setup.minPlayersRequired')}</p>
      )}
    </div>
  );
}

export default MinigameSetup;
