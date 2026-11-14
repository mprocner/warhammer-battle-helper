import { useCallback, useRef } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';

export const LOBBY_PATH = '/games';
export const gamePath = (gameId) => `${LOBBY_PATH}/${gameId}`;

// The game session has its own URL, /games/:gameId (PLAYRPG-338), so a reload, a bookmark and the
// browser's Back button all work. Entering a game pushes a history entry marked `fromLobby`;
// leaving walks back to it, which brings the lobby back with its own query string (the role
// filter and search, PLAYRPG-298/299). A game opened from a link has no lobby behind it, so
// leaving replaces the game with the bare lobby instead of stepping out of the app.
export default function useGameRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const match = useMatch(`${LOBBY_PATH}/:gameId`);
  const fromLobby = location.state?.fromLobby === true;
  const onLobby = location.pathname === LOBBY_PATH;
  // The history entry we already left. A session can end twice in one tick (GAME_DELETED on the
  // socket and a 404 from the refetch it triggers); a second Back would walk past the lobby.
  const leftEntryRef = useRef(null);

  const openGame = useCallback((gameId) => {
    navigate(gamePath(gameId), { state: { fromLobby: onLobby } });
  }, [navigate, onLobby]);

  const leaveGame = useCallback(() => {
    if (leftEntryRef.current === location.key) return;
    leftEntryRef.current = location.key;
    if (fromLobby) navigate(-1);
    else navigate(LOBBY_PATH, { replace: true });
  }, [navigate, fromLobby, location.key]);

  return { gameId: match?.params.gameId ?? null, openGame, leaveGame };
}
