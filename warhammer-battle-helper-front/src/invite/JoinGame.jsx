import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { storePendingInvite } from './pendingInvite';

// /join/:token — the entry point of a game invite link. It never renders anything: it parks the
// token and leaves at once, so the secret spends as little time as possible in the address bar.
// A logged-in visitor goes to /games and joins right away (onInviteReady); a guest goes to /login,
// and useInviteJoin picks the token up after they log in (or register, verify and log in).
const JoinGame = ({ user, onInviteReady }) => {
  const { token } = useParams();
  const [parked, setParked] = useState(false);

  useEffect(() => {
    if (token) storePendingInvite(token);
    setParked(true);
    if (user) onInviteReady?.();
    // Runs once per link: the token is the only input that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!parked) return null;
  return <Navigate to={user ? '/games' : '/login'} replace />;
};

export default JoinGame;
