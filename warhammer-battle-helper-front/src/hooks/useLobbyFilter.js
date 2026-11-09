import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { filterLobbyGames, lobbyFilterVisibility } from '../components/lobby/lobbyFilter';

const ROLES = ['gm', 'player'];

// Lobby filter state lives in the URL (?role=gm&q=...), not in component state: entering a game
// unmounts the lobby under the same /games path, and the URL is what survives the round trip
// and a reload. The role param is ignored while the chips are hidden, so nothing filters invisibly.
export default function useLobbyFilter(games, userEmail) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { showRoles, showSearch } = useMemo(() => lobbyFilterVisibility(games, userEmail), [games, userEmail]);

  const urlRole = params.get('role');
  const role = showRoles && ROLES.includes(urlRole) ? urlRole : null;
  const query = params.get('q') || '';

  // Replace, not push: each keystroke must not become a history entry.
  const update = useCallback((changes) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      Object.entries(changes).forEach(([key, value]) => {
        if (value) next.set(key, value);
        else next.delete(key);
      });
      return next;
    }, { replace: true });
  }, [setParams]);

  const setRole = useCallback((value) => update({ role: value }), [update]);
  const setQuery = useCallback((value) => update({ q: value }), [update]);
  const clear = useCallback(() => update({ role: null, q: null }), [update]);

  const visibleGames = useMemo(
    () => filterLobbyGames(games, { role, query, userEmail, t }),
    [games, role, query, userEmail, t],
  );

  return { role, query, setRole, setQuery, clear, showRoles, showSearch, visibleGames };
}
