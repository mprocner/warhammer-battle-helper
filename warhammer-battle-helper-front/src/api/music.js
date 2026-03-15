import axiosInstance from './axios';

// --- Music Library ---

export const getMusic = async () => {
  const response = await axiosInstance.get('/music');
  return response.data;
};

export const uploadMusic = async (files, folderId = null) => {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  if (folderId) formData.append('folderId', folderId);

  const response = await axiosInstance.post('/music/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  return response.data;
};

export const deleteMusic = async (musicId) => {
  const response = await axiosInstance.delete(`/music/${musicId}`);
  return response.data;
};

// --- Music Folders ---

export const createMusicFolder = async (name, parentId = null) => {
  const response = await axiosInstance.post('/music/folders', { name, parentId });
  return response.data;
};

export const renameMusicFolder = async (folderId, name) => {
  const response = await axiosInstance.put(`/music/folders/${folderId}`, { name });
  return response.data;
};

export const deleteMusicFolder = async (folderId, deleteContents = false) => {
  const response = await axiosInstance.delete(`/music/folders/${folderId}?deleteContents=${deleteContents}`);
  return response.data;
};

export const moveMusicFile = async (musicId, folderId) => {
  const response = await axiosInstance.put(`/music/${musicId}/move`, { folderId: folderId || null });
  return response.data;
};

// --- Playlists ---

export const createPlaylist = async (name, tracks = []) => {
  const response = await axiosInstance.post('/playlists', { name, tracks });
  return response.data;
};

export const updatePlaylist = async (playlistId, name, tracks) => {
  const response = await axiosInstance.put(`/playlists/${playlistId}`, { name, tracks });
  return response.data;
};

export const deletePlaylist = async (playlistId) => {
  const response = await axiosInstance.delete(`/playlists/${playlistId}`);
  return response.data;
};

export const reorderPlaylists = async (playlistIds) => {
  const response = await axiosInstance.put('/playlists/reorder', { playlistIds });
  return response.data;
};

// --- Game Playback (GM-only) ---

export const playTrack = async (gameId, trackUrl, trackName, position = 0) => {
  const response = await axiosInstance.post(`/games/${gameId}/music/play`, {
    trackUrl, trackName, position
  });
  return response.data;
};

export const pauseTrack = async (gameId, position) => {
  const response = await axiosInstance.post(`/games/${gameId}/music/pause`, { position });
  return response.data;
};

export const stopTrack = async (gameId) => {
  const response = await axiosInstance.post(`/games/${gameId}/music/stop`, {});
  return response.data;
};

export const setVolume = async (gameId, volume) => {
  const response = await axiosInstance.post(`/games/${gameId}/music/volume`, { volume });
  return response.data;
};

const musicApi = {
  getMusic,
  uploadMusic,
  deleteMusic,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  reorderPlaylists,
  playTrack,
  pauseTrack,
  stopTrack,
  setVolume
};

export default musicApi;
