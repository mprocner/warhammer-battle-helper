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

export const addSceneCharacter = async (gameId, sceneId, data) => {
  const response = await axiosInstance.post(`/games/${gameId}/scenes/${sceneId}/characters`, data);
  return response.data;
};

export const moveSceneCharacter = async (gameId, sceneId, data) => {
  const response = await axiosInstance.put(`/games/${gameId}/scenes/${sceneId}/characters/move`, data);
  return response.data;
};

export const removeSceneCharacter = async (gameId, sceneId, charId) => {
  const response = await axiosInstance.delete(`/games/${gameId}/scenes/${sceneId}/characters/${charId}`);
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
