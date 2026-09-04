import axiosInstance from './axios';

export const getScenes = async (gameId) => {
  const response = await axiosInstance.get(`/games/${gameId}/scenes`);
  return response.data;
};

export const createScene = async (gameId, data) => {
  const response = await axiosInstance.post(`/games/${gameId}/scenes`, data);
  return response.data;
};

export const updateScene = async (gameId, sceneId, data) => {
  const response = await axiosInstance.put(`/games/${gameId}/scenes/${sceneId}`, data);
  return response.data;
};

export const deleteScene = async (gameId, sceneId) => {
  const response = await axiosInstance.delete(`/games/${gameId}/scenes/${sceneId}`);
  return response.data;
};

export const assignPlayerToScene = async (gameId, sceneId, playerId, assign) => {
  const response = await axiosInstance.put(`/games/${gameId}/scenes/${sceneId}/assign`, {
    playerId,
    assign,
  });
  return response.data;
};

export const addSceneImage = async (gameId, sceneId, data) => {
  const response = await axiosInstance.post(`/games/${gameId}/scenes/${sceneId}/images`, data);
  return response.data;
};

export const updateSceneImage = async (gameId, sceneId, imageId, data) => {
  const response = await axiosInstance.put(`/games/${gameId}/scenes/${sceneId}/images/${imageId}`, data);
  return response.data;
};

export const deleteSceneImage = async (gameId, sceneId, imageId) => {
  const response = await axiosInstance.delete(`/games/${gameId}/scenes/${sceneId}/images/${imageId}`);
  return response.data;
};

export const batchMoveTokens = async (gameId, sceneId, payload) => {
  const response = await axiosInstance.patch(`/games/${gameId}/scenes/${sceneId}/tokens/batch`, payload);
  return response.data;
};

// Creates `count` copies of an image next to the original (GM only). Copies keep the token overlay config.
export const duplicateSceneImage = async (gameId, sceneId, imageId, count) => {
  const response = await axiosInstance.post(`/games/${gameId}/scenes/${sceneId}/images/${imageId}/duplicate`, { count });
  return response.data;
};

// Steps or sets one HP bar on an image-token (GM only). data = { barId, delta } or { barId, value }.
export const patchSceneImageTokenHP = async (gameId, sceneId, imageId, data) => {
  const response = await axiosInstance.patch(`/games/${gameId}/scenes/${sceneId}/images/${imageId}/tokenOverlay/hp`, data);
  return response.data;
};

// Bumps an icon slot level or sets a number slot value (GM only). data = { slotId, delta } or { slotId, number }.
export const patchSceneImageTokenSlot = async (gameId, sceneId, imageId, data) => {
  const response = await axiosInstance.patch(`/games/${gameId}/scenes/${sceneId}/images/${imageId}/tokenOverlay/slot`, data);
  return response.data;
};

// Shares/unshares one ring position across every tokens-layer image in every scene of the game (GM only).
// data = { position, locked, slot? }. slot required only when locked=true.
export const applyImageTokenSlot = async (gameId, sceneId, data) => {
  const response = await axiosInstance.put(`/games/${gameId}/scenes/${sceneId}/tokenSlotConfig`, data);
  return response.data;
};

export const toggleFog = async (gameId, sceneId, data) => {
  const response = await axiosInstance.patch(`/games/${gameId}/scenes/${sceneId}/fog`, data);
  return response.data;
};

export const addFogPath = async (gameId, sceneId, data) => {
  const response = await axiosInstance.post(`/games/${gameId}/scenes/${sceneId}/fog/path`, data);
  return response.data;
};

export const clearFogPaths = async (gameId, sceneId) => {
  const response = await axiosInstance.delete(`/games/${gameId}/scenes/${sceneId}/fog/paths`);
  return response.data;
};

export const undoLastFogPath = async (gameId, sceneId) => {
  const response = await axiosInstance.delete(`/games/${gameId}/scenes/${sceneId}/fog/path/last`);
  return response.data;
};

export const revealAllFog = async (gameId, sceneId) => {
  const response = await axiosInstance.post(`/games/${gameId}/scenes/${sceneId}/fog/reveal-all`);
  return response.data;
};

export const addDrawingPath = async (gameId, sceneId, data) => {
  const response = await axiosInstance.post(`/games/${gameId}/scenes/${sceneId}/drawing/path`, data);
  return response.data;
};

export const undoLastDrawingPath = async (gameId, sceneId) => {
  const response = await axiosInstance.delete(`/games/${gameId}/scenes/${sceneId}/drawing/path/last`);
  return response.data;
};

export const clearDrawingPaths = async (gameId, sceneId) => {
  const response = await axiosInstance.delete(`/games/${gameId}/scenes/${sceneId}/drawing/paths`);
  return response.data;
};

export const deleteDrawingPath = async (gameId, sceneId, pathId) => {
  const response = await axiosInstance.delete(`/games/${gameId}/scenes/${sceneId}/drawing/path/${pathId}`);
  return response.data;
};
