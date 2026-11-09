import axiosInstance from './axios';

const base = (gameId, sceneId) => `/games/${gameId}/scenes/${sceneId}/combat`;

// Writes return 204 and nothing else: the SCENE_COMBAT_UPDATED event makes every client, including
// the caller, refetch its own masked view.
export const getCombat = async (gameId, sceneId) => (await axiosInstance.get(base(gameId, sceneId))).data.combat || null;
export const getCombatScenes = async (gameId) => (await axiosInstance.get(`/games/${gameId}/combats`)).data.sceneIds || [];
export const startCombat = (gameId, sceneId) => axiosInstance.post(base(gameId, sceneId));
export const endCombat = (gameId, sceneId) => axiosInstance.delete(base(gameId, sceneId));
export const setCombatVisibility = (gameId, sceneId, visibleToPlayers) => axiosInstance.patch(base(gameId, sceneId), { visibleToPlayers });
export const addCombatEntries = (gameId, sceneId, entries) => axiosInstance.post(`${base(gameId, sceneId)}/entries`, { entries });
export const updateCombatEntry = (gameId, sceneId, entryId, patch) => axiosInstance.patch(`${base(gameId, sceneId)}/entries/${entryId}`, patch);
export const removeCombatEntry = (gameId, sceneId, entryId) => axiosInstance.delete(`${base(gameId, sceneId)}/entries/${entryId}`);
export const reorderCombat = (gameId, sceneId, entryIds) => axiosInstance.put(`${base(gameId, sceneId)}/order`, { entryIds });
export const activateCombatEntry = (gameId, sceneId, entryId) => axiosInstance.post(`${base(gameId, sceneId)}/activate`, { entryId });
export const nextTurn = (gameId, sceneId, afterEntryId) => axiosInstance.post(`${base(gameId, sceneId)}/next`, { afterEntryId: afterEntryId || '' });
export const endTurn = (gameId, sceneId, entryId) => axiosInstance.post(`${base(gameId, sceneId)}/end-turn`, { entryId });
export const endRound = (gameId, sceneId) => axiosInstance.post(`${base(gameId, sceneId)}/end-round`);
