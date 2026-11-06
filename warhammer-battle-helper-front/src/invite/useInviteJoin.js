import { useCallback, useEffect, useRef } from 'react';
import { joinGameByInvite } from '../api/invites';
import { storePendingInvite, takePendingInvite } from './pendingInvite';

// Consumes a parked invite token once a user is logged in, and opens the game it points at.
// Runs on every login (covers "logged out → log in" and "register → verify → log in"); the
// returned function lets /join trigger it directly for a visitor who is already logged in.
//
// onFailed receives an i18n key suffix under `game.` — the lobby notice convention in App.js.
export const useInviteJoin = ({ user, onJoined, onFailed }) => {
  // Refs keep the latest callbacks without making the effect re-run when App re-renders.
  const onJoinedRef = useRef(onJoined);
  const onFailedRef = useRef(onFailed);
  onJoinedRef.current = onJoined;
  onFailedRef.current = onFailed;

  const consume = useCallback(async () => {
    if (!user) return;
    const token = takePendingInvite();
    if (!token) return;
    try {
      const { gameId } = await joinGameByInvite(token);
      onJoinedRef.current(gameId);
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) {
        // The session expired: the axios interceptor sends the visitor to /login. Park the token
        // again so the next login still lands in the game.
        storePendingInvite(token);
        return;
      }
      onFailedRef.current(status === 404 ? 'inviteLinkInvalid' : 'inviteLinkFailed');
    }
  }, [user]);

  useEffect(() => {
    consume();
  }, [consume]);

  return consume;
};

export default useInviteJoin;
