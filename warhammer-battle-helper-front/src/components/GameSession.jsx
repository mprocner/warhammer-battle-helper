import React, { useState, useEffect, useCallback } from 'react';
import { Box, Button, Typography, Alert, CircularProgress } from '@mui/material';
import DragAndDropContext from './DndContext';
import RightPanel from './panels/RightPanel';
import PanelToggle from './panels/PanelToggle';
import useWebSocket from '../hooks/useWebSocket';
import { getApiUrl, getApiHeaders } from '../api/axios';

/**
 * GameSession component - manages a multiplayer game session with real-time sync
 */
const GameSession = ({ gameId, token, onLeaveGame, onLogout }) => {
  const [gameState, setGameState] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [characterUpdateTrigger, setCharacterUpdateTrigger] = useState(0);
  const [leftPanelHidden, setLeftPanelHidden] = useState(false);
  const [rightPanelHidden, setRightPanelHidden] = useState(false);

  // Add log message - Define early so it can be used in callbacks
  const addLogMessage = useCallback((message, type = 'info', data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { message, type, timestamp, data }]);
  }, []);

  // Fetch initial game state via REST API
  const fetchGameState = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}`, {
        headers: getApiHeaders({
          'Authorization': `Bearer ${token}`
        })
      });

      if (!response.ok) throw new Error('Failed to fetch game state');

      const game = await response.json();
      setGameState(game);

      // Load historical events into logs (only on initial load)
      if (game.events && Array.isArray(game.events) && !historyLoaded) {
        const historicalLogs = game.events.map(event => {
          let message = '';
          const timestamp = new Date(event.createdAt).toLocaleTimeString();

          switch (event.type) {
            case 'join':
              message = `${event.username} joined the game`;
              return { message, type: 'success', timestamp };
            case 'leave':
              message = `${event.username} left the game`;
              return { message, type: 'info', timestamp };
            case 'character_add':
              message = `${event.username} added character to battlefield`;
              return { message, type: 'success', timestamp };
            case 'move':
              // Don't show movement events in chat
              return null;
            case 'dice_roll':
              // Check if it's a skill roll (has skillKey)
              if (event.data.skillKey && event.data.characterId) {
                return {
                  message: null,
                  type: 'skill_roll',
                  timestamp,
                  data: {
                    rollType: 'skill',
                    ...event.data
                  }
                };
              }
              // Check if it's an attribute roll
              else if (event.data.attribute && event.data.characterId) {
                return {
                  message: null,
                  type: 'dice_roll',
                  timestamp,
                  data: {
                    rollType: 'attribute',
                    ...event.data
                  }
                };
              }
              // Simple dice roll
              else {
                return {
                  message: null,
                  type: 'dice_roll',
                  timestamp,
                  data: {
                    rollType: 'simple',
                    result: event.data.result,
                    sides: event.data.sides
                  }
                };
              }
            case 'skill_roll':
              return {
                message: null,
                type: 'skill_roll',
                timestamp,
                data: {
                  rollType: 'skill',
                  ...event.data
                }
              };
            case 'attack':
              // Check if we have structured fight data
              if (event.data.result) {
                return {
                  message: null,
                  type: 'fight',
                  timestamp,
                  data: {
                    rollType: 'fight',
                    ...event.data
                  }
                };
              }
              // Fallback for old format
              if (event.data.messages && Array.isArray(event.data.messages)) {
                return event.data.messages.map(msg => ({
                  message: msg,
                  type: 'info',
                  timestamp
                }));
              }
              return { message: `${event.username} initiated combat`, type: 'warning', timestamp };
            case 'message':
              message = event.data.message || '';
              return { message, type: event.data.type || 'info', timestamp };
            default:
              return null;
          }
        }).flat().filter(log => log !== null);

        setLogs(historicalLogs);
        setHistoryLoaded(true);
      }

      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch game state:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [gameId, token, historyLoaded]);

  // Handle incoming WebSocket messages
  const handleWebSocketMessage = useCallback((message) => {
    console.log('GameSession: Received WebSocket message', message);
    console.log('GameSession: handleWebSocketMessage function ID:', handleWebSocketMessage);

    switch (message.type) {
      case 'GAME_STATE':
        // Full game state received
        setGameState(message.payload.game);
        addLogMessage('Game state synchronized', 'info');
        setLoading(false);
        break;

      case 'PARTICIPANT_JOINED':
        addLogMessage(
          `${message.payload.username} joined the game`,
          'success'
        );
        // Fetch updated game state
        fetchGameState();
        break;

      case 'PARTICIPANT_LEFT':
        addLogMessage(
          `A player left the game`,
          'info'
        );
        fetchGameState();
        break;

      case 'CHARACTER_ADDED':
        addLogMessage(
          `Character added to the battlefield`,
          'success'
        );
        fetchGameState();
        setCharacterUpdateTrigger(prev => prev + 1);
        break;

      case 'CHARACTER_MOVED':
        // Just update the game state without logging to chat
        fetchGameState();
        setCharacterUpdateTrigger(prev => prev + 1);
        break;

      case 'CHARACTER_REMOVED':
        addLogMessage('Character removed from battlefield', 'info');
        fetchGameState();
        setCharacterUpdateTrigger(prev => prev + 1);
        break;

      case 'LOG_MESSAGE':
        addLogMessage(
          `${message.payload.username}: ${message.payload.message}`,
          message.payload.type || 'info'
        );
        break;

      case 'DICE_ROLLED':
        // Pass structured data to log
        addLogMessage(null, 'dice_roll', {
          rollType: message.payload.attribute ? 'attribute' : 'simple',
          ...message.payload
        });
        break;

      case 'SKILL_ROLLED':
        // Pass structured data to log
        addLogMessage(null, 'skill_roll', {
          rollType: 'skill',
          ...message.payload
        });
        break;

      case 'FIGHT_RESULT':
        // Pass structured fight data to log
        console.log('FIGHT_RESULT received:', message.payload);
        console.log('FIGHT_RESULT result:', message.payload.result);
        addLogMessage(null, 'fight', {
          rollType: 'fight',
          ...message.payload
        });
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }, [fetchGameState, addLogMessage]);

  // WebSocket connection
  const { isConnected, error: wsError } = useWebSocket(
    gameId,
    token,
    handleWebSocketMessage
  );

  useEffect(() => {
    fetchGameState();
  }, [fetchGameState]);

  // Handle leaving the game
  const handleLeaveGame = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}/leave`, {
        method: 'POST',
        headers: getApiHeaders({
          'Authorization': `Bearer ${token}`
        })
      });

      if (!response.ok) throw new Error('Failed to leave game');

      onLeaveGame();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 2
      }}>
        <CircularProgress size={60} thickness={4} />
        <Typography
          variant="h5"
          sx={{
            fontFamily: 'Cinzel, serif',
            color: 'text.primary'
          }}
        >
          Loading game session...
        </Typography>
      </Box>
    );
  }

  if (error && !gameState) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button variant="contained" onClick={onLeaveGame}>
          Back to Lobby
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {wsError && (
        <Alert severity="warning" sx={{ m: 2 }}>
          WebSocket error: {wsError}
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ m: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Main Game Area */}
      <Box sx={{
        flexGrow: 1,
        display: 'flex',
        overflow: 'hidden',
        position: 'relative'
      }}>
        {/* Right Panel Toggle */}
        <PanelToggle
          position="right"
          isHidden={rightPanelHidden}
          onClick={() => setRightPanelHidden(!rightPanelHidden)}
        />

        {/* Battle Grid */}
        <Box sx={{
          flexGrow: 1,
          overflow: 'auto'
        }}>
          <DragAndDropContext
            addLogMessage={addLogMessage}
            gameId={gameId}
            token={token}
            characterUpdateTrigger={characterUpdateTrigger}
            isHidden={leftPanelHidden}
            onTogglePanel={() => setLeftPanelHidden(!leftPanelHidden)}
          />
        </Box>

        {/* Right Panel */}
        <RightPanel
          isHidden={rightPanelHidden}
          logs={logs}
          addLogMessage={addLogMessage}
          gameId={gameId}
          token={token}
          onLogout={onLogout}
          onLeaveGame={handleLeaveGame}
          gameState={gameState}
          isConnected={isConnected}
        />
      </Box>
    </Box>
  );
};

export default GameSession;
