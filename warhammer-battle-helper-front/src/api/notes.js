import axiosInstance from './axios';

export const getNotes = async (gameId) => {
  const response = await axiosInstance.get(`/games/${gameId}/notes`);
  return response.data;
};

export const createNote = async (gameId, data) => {
  const response = await axiosInstance.post(`/games/${gameId}/notes`, data);
  return response.data;
};

export const updateNote = async (gameId, noteId, data) => {
  const response = await axiosInstance.put(`/games/${gameId}/notes/${noteId}`, data);
  return response.data;
};

export const deleteNote = async (gameId, noteId) => {
  const response = await axiosInstance.delete(`/games/${gameId}/notes/${noteId}`);
  return response.data;
};
