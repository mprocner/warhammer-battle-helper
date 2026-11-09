import { findMatch } from './systemOptions';
import { systemLabel } from './gameLabels';

export const gameRole = (game, userEmail) => (game.gameMasterEmail === userEmail ? 'gm' : 'player');

// Role chips appear only when they can narrow the list (games in both roles), otherwise one chip
// would always show nothing. Search is always there once there is a game: a box that shows up
// only past some count surprises people and drops the typed text when the list shrinks.
export function lobbyFilterVisibility(games, userEmail) {
  const roles = new Set(games.map(g => gameRole(g, userEmail)));
  return {
    showRoles: roles.size === 2,
    showSearch: games.length > 0,
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
