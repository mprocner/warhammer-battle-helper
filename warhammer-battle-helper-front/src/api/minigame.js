import axiosInstance from './axios';

export const startMinigame = async (gameId, gameType, players, maxRounds = 13) => {
  const response = await axiosInstance.post(`/games/${gameId}/minigame/start`, { gameType, players, maxRounds });
  return response.data;
};

export const endMinigame = async (gameId) => {
  const response = await axiosInstance.delete(`/games/${gameId}/minigame`);
  return response.data;
};

export const getMinigameState = async (gameId) => {
  try {
    const response = await axiosInstance.get(`/games/${gameId}/minigame`);
    return response.data;
  } catch {
    return null;
  }
};

export const rollDice = async (gameId) => {
  const response = await axiosInstance.post(`/games/${gameId}/minigame/roll`);
  return response.data;
};

export const setHeld = async (gameId, held) => {
  const response = await axiosInstance.patch(`/games/${gameId}/minigame/held`, { held });
  return response.data;
};

export const scoreCategory = async (gameId, category) => {
  const response = await axiosInstance.post(`/games/${gameId}/minigame/score`, { category });
  return response.data;
};

export const confirmHand = async (gameId) => {
  const response = await axiosInstance.post(`/games/${gameId}/minigame/confirm`);
  return response.data;
};

export const nextRound = async (gameId) => {
  const response = await axiosInstance.post(`/games/${gameId}/minigame/next-round`);
  return response.data;
};
