import { findMatch } from './systemOptions';
import { systemLabel } from './gameLabels';

// Below this many games the whole list fits on screen, so a search box is only clutter.
export const SEARCH_THRESHOLD = 8;

export const gameRole = (game, userEmail) => (game.gameMasterEmail === userEmail ? 'gm' : 'player');

// Each control appears only when it can narrow the list: role chips need games in both roles,
// search needs more games than fit at a glance. Counted on the whole list, so switching a chip
// never hides the search box (and the text typed into it).
export function lobbyFilterVisibility(games, userEmail) {
  const roles = new Set(games.map(g => gameRole(g, userEmail)));
  return {
    showRoles: roles.size === 2,
    showSearch: games.length > SEARCH_THRESHOLD,
  };
}

// `role` null means all games. Search looks at the game name and the system label the card shows.
export function filterLobbyGames(games, { role, query, userEmail, t }) {
  const hasQuery = query.trim() !== '';
  return games.filter(game => {
    if (role && gameRole(game, userEmail) !== role) return false;
    if (!hasQuery) return true;
    return Boolean(findMatch(game.name || '', query) || findMatch(systemLabel(game, t), query));
  });
}
