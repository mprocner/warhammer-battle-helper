import { useMemo } from 'react';

/**
 * Parses the JWT token and returns the current user's ID.
 * Returns null if the token is missing or malformed.
 */
export function useCurrentUser(token) {
  const userId = useMemo(() => {
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.user_id;
    } catch {
      return null;
    }
  }, [token]);

  return { userId };
}
