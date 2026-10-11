import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiUrl, getApiHeaders } from '../api/axios';

// Codes the backend returns when a template cannot back a game (PLAYRPG-240).
const TEMPLATE_ERROR_KEYS = {
  template_missing_char_name: 'creator.templateMissingCharName',
  template_duplicate_char_name: 'creator.templateDuplicateCharName',
  template_duplicate_char_avatar: 'creator.templateDuplicateCharAvatar',
};

// useGames owns the lobby's game list and every mutation on it. Mutations update local
// state instead of refetching — the list changes rarely and only through these actions.
export function useGames(token) {
  const { t } = useTranslation();
  const [games, setGames] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncingGameId, setSyncingGameId] = useState(null);

  const authHeaders = useCallback(
    (extra) => getApiHeaders({ Authorization: `Bearer ${token}`, ...extra }),
    [token]
  );

  const fetchGames = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/games`, { headers: authHeaders() });
      if (!response.ok) throw new Error('Failed to fetch games');
      setGames((await response.json()) || []);
    } catch (err) {
      setError(err.message);
    }
  }, [authHeaders]);

  // Returns the created game, or null when creation failed (error state is set).
  const createGame = useCallback(async ({ name, gameSystem, customTemplateId }) => {
    setLoading(true);
    setError('');
    try {
      const body = { name, gameSystem };
      if (customTemplateId) body.customTemplateId = customTemplateId;

      const response = await fetch(`${getApiUrl()}/games`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorData = await response.json();
        const key = TEMPLATE_ERROR_KEYS[errorData.error];
        throw new Error(key ? t(key) : (errorData.error || 'Failed to create game'));
      }
      return await response.json();
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [authHeaders, t]);

  // Drops the game from the list on success — used by both delete (GM) and leave (player).
  const removeGame = useCallback(async (gameId, path, method) => {
    setLoading(true);
    try {
      const response = await fetch(`${getApiUrl()}/games/${gameId}${path}`, {
        method,
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(`Failed to ${method === 'DELETE' ? 'delete' : 'leave'} game`);
      setGames(prev => prev.filter(g => g.id !== gameId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const deleteGame = useCallback((gameId) => removeGame(gameId, '', 'DELETE'), [removeGame]);
  const leaveGame = useCallback((gameId) => removeGame(gameId, '/leave', 'POST'), [removeGame]);

  // Pulls the latest template version into an existing custom game. Refetches because the
  // server rewrites the game's embedded template snapshot.
  const syncTemplate = useCallback(async (gameId) => {
    setSyncingGameId(gameId);
    try {
      const res = await fetch(`${getApiUrl()}/games/${gameId}/syncTemplate`, {
        method: 'POST',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const data = await res.json();
        const key = TEMPLATE_ERROR_KEYS[data.error];
        setError(key ? t(key) : (data.error || t('creator.syncFailed')));
        return;
      }
      await fetchGames();
    } catch {
      setError(t('creator.syncFailed'));
    } finally {
      setSyncingGameId(null);
    }
  }, [authHeaders, fetchGames, t]);

  return {
    games, error, loading, syncingGameId,
    setError, fetchGames, createGame, deleteGame, leaveGame, syncTemplate,
  };
}

export default useGames;
