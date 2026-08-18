// Maps a failed game fetch onto the reason the session ended, or null when the status is
// not about access at all. The returned string doubles as the i18n key suffix under
// `game.` — the lobby renders it as the notice explaining why the user is back there.
export const sessionEndReasonForStatus = (status) => {
  if (status === 403) return 'accessRevoked';
  if (status === 404) return 'gameNotFound';
  return null;
};
