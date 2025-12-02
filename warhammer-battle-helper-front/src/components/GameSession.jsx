import React, { useState, useEffect, useCallback } from 'react';
import { Box, Button, Typography, Alert, CircularProgress, Chip } from '@mui/material';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import DragAndDropContext from './DndContext';
import LogWindow from './LogWindow';
import useWebSocket from '../hooks/useWebSocket';
import { getApiUrl, getApiHeaders } from '../api/axios';

/**
 * GameSession component - manages a multiplayer game session with real-time sync
 */
const GameSession = ({ gameId, token, onLeaveGame }) => {
  const [gameState, setGameState] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [characterUpdateTrigger, setCharacterUpdateTrigger] = useState(0);

  // Add log message - Define early so it can be used in callbacks
  const addLogMessage = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { message, type, timestamp }]);
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
              message = `${event.username} rolled d${event.data.sides}: ${event.data.result}`;
              return { message, type: 'success', timestamp };
            case 'attack':
              // For fights, we need to process messages array
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
        // Check if this is a characteristic test
        if (message.payload.attribute && message.payload.attributeValue) {
          const rollResult = message.payload.result;
          const attributeValue = message.payload.attributeValue;
          const attributeModifier = message.payload.attributeModifier || 0;
          const successLevel = Math.floor(attributeValue / 10) - Math.floor(rollResult / 10);
          const success = rollResult <= attributeValue;
          const successText = success
            ? `Success! (SL: ${successLevel})`
            : `Failure! (SL: ${successLevel})`;

          // Add modifier text if non-zero
          const modifierText = attributeModifier !== 0
            ? ` (${attributeModifier > 0 ? '+' : ''}${attributeModifier})`
            : '';

          addLogMessage(
            `${message.payload.characterName || 'Character'} - ${message.payload.attribute}${modifierText} Test: Rolled ${rollResult} vs ${attributeValue} - ${successText}`,
            success ? 'success' : 'error'
          );
        } else {
          // Regular dice roll
          addLogMessage(
            `${message.payload.username} rolled d${message.payload.sides}: ${message.payload.result}`,
            'success'
          );
        }
        break;

      case 'FIGHT_RESULT':
        addLogMessage(`${message.payload.username} initiated combat`, 'warning');
        // Display all fight messages
        if (message.payload.messages && Array.isArray(message.payload.messages)) {
          message.payload.messages.forEach(msg => {
            addLogMessage(msg, 'info');
          });
        }
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
      {/* Game Header */}
      <Box sx={{
        p: 2,
        borderBottom: '3px solid',
        borderColor: 'primary.main',
        background: 'linear-gradient(135deg, #f4e8d8 0%, #ede0ce 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontFamily: 'Cinzel, serif',
              fontWeight: 700,
              color: 'primary.main'
            }}
          >
            {gameState?.name || 'Game Session'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Chip
              label={isConnected ? 'Connected' : 'Disconnected'}
              color={isConnected ? 'success' : 'error'}
              size="small"
              sx={{ fontFamily: 'Crimson Text, serif' }}
            />
            <Chip
              label={`${gameState?.participants?.length || 0} Players`}
              size="small"
              sx={{ fontFamily: 'Crimson Text, serif' }}
            />
          </Box>
        </Box>

        <Button
          variant="outlined"
          startIcon={<ExitToAppIcon />}
          onClick={handleLeaveGame}
          sx={{
            fontFamily: 'Crimson Text, serif',
            fontWeight: 600
          }}
        >
          Leave Game
        </Button>
      </Box>

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
        overflow: 'hidden'
      }}>
        {/* Battle Grid */}
        <Box sx={{
          flexGrow: 1,
          overflow: 'auto',
          p: 2
        }}>
          <DragAndDropContext
            addLogMessage={addLogMessage}
            gameId={gameId}
            token={token}
            characterUpdateTrigger={characterUpdateTrigger}
          />
        </Box>

        {/* Log Window */}
        <Box sx={{
          width: '350px',
          borderLeft: '3px solid',
          borderColor: 'primary.main',
          background: 'background.paper'
        }}>
          <LogWindow
            logs={logs}
            addLogMessage={addLogMessage}
            gameId={gameId}
            token={token}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default GameSession;
