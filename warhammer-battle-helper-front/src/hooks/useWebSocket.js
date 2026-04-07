import { useEffect, useRef, useState, useCallback } from 'react';

// Get WebSocket URL from environment variable
const getWsUrl = () => {
  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8080';
  // Convert http to ws, https to wss
  return apiUrl.replace(/^http/, 'ws');
};

/**
 * Custom hook for WebSocket connection to game room
 * @param {string} gameId - The game ID to connect to
 * @param {string} token - JWT authentication token
 * @param {function} onMessage - Callback for handling incoming messages
 */
const useWebSocket = (gameId, token, onMessage) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const instanceId = useRef(Math.random().toString(36).substring(7));
  const manuallyDisconnectedRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  const connect = useCallback(() => {
    if (!gameId || !token) {
      console.log('WebSocket: Missing gameId or token');
      return;
    }

    // Prevent duplicate connections
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket: Already connected, skipping connection attempt');
      return;
    }

    manuallyDisconnectedRef.current = false;

    try {
      const wsUrl = `${getWsUrl()}/games/${gameId}/ws?token=${token}`;
      console.log('WebSocket: Connecting to', wsUrl);

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log(`WebSocket [${instanceId.current}]: Connected to game`, gameId);
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log(`WebSocket [${instanceId.current}]: Received message`, message);

          if (onMessageRef.current) {
            onMessageRef.current(message);
          }
        } catch (err) {
          console.error(`WebSocket [${instanceId.current}]: Failed to parse message`, err);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket: Error', error);
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        console.log('WebSocket: Disconnected');
        setIsConnected(false);

        // Attempt to reconnect only if not manually disconnected
        if (!manuallyDisconnectedRef.current) {
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
            console.log(`WebSocket: Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);

            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptsRef.current += 1;
              connect();
            }, delay);
          } else {
            setError('Failed to connect after multiple attempts');
          }
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('WebSocket: Connection failed', err);
      setError(err.message);
    }
  }, [gameId, token]);

  const disconnect = useCallback(() => {
    manuallyDisconnectedRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      console.log('WebSocket: Manually disconnecting');
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((type, payload) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type, payload });
      console.log('WebSocket: Sending message', { type, payload });
      wsRef.current.send(message);
    } else {
      console.warn('WebSocket: Cannot send message, not connected');
    }
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    error,
    sendMessage,
    reconnect: connect,
    disconnect
  };
};

export default useWebSocket;
