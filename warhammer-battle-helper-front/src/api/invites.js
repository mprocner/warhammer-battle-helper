import axiosInstance from './axios';

// Game invite links (PLAYRPG-303). The GM endpoints resolve to the current token ('' = no link).

export const getInviteLink = async (gameId) => {
  const response = await axiosInstance.get(`/games/${gameId}/inviteLink`);
  return response.data.token;
};

export const regenerateInviteLink = async (gameId) => {
  const response = await axiosInstance.post(`/games/${gameId}/inviteLink`);
  return response.data.token;
};

export const revokeInviteLink = async (gameId) => {
  await axiosInstance.delete(`/games/${gameId}/inviteLink`);
};

// The token travels in the body so it never lands in a request URL / access log.
// Resolves to { gameId, joined }.
export const joinGameByInvite = async (token) => {
  const response = await axiosInstance.post('/invites/join', { token });
  return response.data;
};

// The shareable URL. /join/<token> is stripped to /join before anything reaches analytics.
export const buildInviteUrl = (token) => `${window.location.origin}/join/${token}`;
