import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import MinigameList from './minigame/MinigameList';
import MinigameSetup from './minigame/MinigameSetup';

function MinigameTab({ gameState, onlineUserIds, userId, minigameState, onReopenBoard }) {
  const { t } = useTranslation();
  const [view, setView] = useState('list');
  const [selectedGame, setSelectedGame] = useState('yahtzee');

  const onlinePlayers = useMemo(() => {
    const participants = gameState?.participants || [];
    return participants.filter(p => onlineUserIds.includes(p.userId));
  }, [gameState?.participants, onlineUserIds]);

  const gameId = gameState?.id;

  const handleSelectGame = (game) => {
    setSelectedGame(game);
    setView('setup');
  };

  if (view === 'setup') {
    return (
      <MinigameSetup
        selectedGame={selectedGame}
        gameId={gameId}
        onlinePlayers={onlinePlayers}
        userId={userId}
        onBack={() => setView('list')}
        onStarted={() => setView('list')}
        t={t}
      />
    );
  }

  return (
    <MinigameList
      minigameState={minigameState}
      onReopenBoard={onReopenBoard}
      onSelectGame={handleSelectGame}
      t={t}
    />
  );
}

export default MinigameTab;
