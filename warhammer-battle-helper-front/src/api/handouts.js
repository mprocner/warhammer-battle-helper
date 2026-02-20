import axiosInstance from './axios';

/**
 * Upload a handout file
 * @param {string} gameId - The game ID
 * @param {File} file - The file to upload
 * @returns {Promise<{url: string}>} - The uploaded file URL
 */
export const uploadHandoutFile = async (gameId, file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axiosInstance.post(`/games/${gameId}/handouts/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  return response.data;
};

/**
 * Create a new handout
 * @param {string} gameId - The game ID
 * @param {Object} handout - The handout data
 * @param {string} handout.title - Handout title
 * @param {string} handout.description - Handout description
 * @param {string} handout.type - Handout type (image, pdf, text, map, letter)
 * @param {string[]} handout.visibility - Visibility array
 * @param {string} handout.fileUrl - File URL
 * @returns {Promise<Object>} - The created handout
 */
export const createHandout = async (gameId, handout) => {
  const response = await axiosInstance.post(`/games/${gameId}/handouts`, handout);
  return response.data;
};

/**
 * Get all visible handouts and folders for a game
 * @param {string} gameId - The game ID
 * @returns {Promise<{handouts: Object[], handoutFolders: Object[]}>}
 */
export const getHandouts = async (gameId) => {
  const response = await axiosInstance.get(`/games/${gameId}/handouts`);
  return response.data;
};

/**
 * Update a handout
 * @param {string} gameId - The game ID
 * @param {string} handoutId - The handout ID
 * @param {Object} updates - The fields to update
 * @returns {Promise<Object>} - Response message
 */
export const updateHandout = async (gameId, handoutId, updates) => {
  const response = await axiosInstance.put(`/games/${gameId}/handouts/${handoutId}`, updates);
  return response.data;
};

/**
 * Delete a handout
 * @param {string} gameId - The game ID
 * @param {string} handoutId - The handout ID
 * @returns {Promise<Object>} - Response message
 */
export const deleteHandout = async (gameId, handoutId) => {
  const response = await axiosInstance.delete(`/games/${gameId}/handouts/${handoutId}`);
  return response.data;
};

/**
 * Reorder handouts
 * @param {string} gameId - The game ID
 * @param {string[]} handoutIds - Array of handout IDs in the new order
 * @returns {Promise<Object>} - Response message
 */
export const reorderHandouts = async (gameId, handoutIds) => {
  const response = await axiosInstance.put(`/games/${gameId}/handouts/reorder`, {
    handoutIds
  });
  return response.data;
};

/**
 * Create a new handout folder
 * @param {string} gameId - The game ID
 * @param {string} name - Folder name
 * @returns {Promise<Object>} - The created folder
 */
export const createHandoutFolder = async (gameId, name) => {
  const response = await axiosInstance.post(`/games/${gameId}/handout-folders`, { name });
  return response.data;
};

/**
 * Rename a handout folder
 * @param {string} gameId - The game ID
 * @param {string} folderId - The folder ID
 * @param {string} name - New folder name
 * @returns {Promise<Object>} - Response message
 */
export const renameHandoutFolder = async (gameId, folderId, name) => {
  const response = await axiosInstance.put(`/games/${gameId}/handout-folders/${folderId}`, { name });
  return response.data;
};

/**
 * Delete a handout folder (handouts become ungrouped)
 * @param {string} gameId - The game ID
 * @param {string} folderId - The folder ID
 * @returns {Promise<Object>} - Response message
 */
export const deleteHandoutFolder = async (gameId, folderId) => {
  const response = await axiosInstance.delete(`/games/${gameId}/handout-folders/${folderId}`);
  return response.data;
};

/**
 * Move a handout to a folder (or ungroup it)
 * @param {string} gameId - The game ID
 * @param {string} handoutId - The handout ID
 * @param {string|null} folderId - Target folder ID, or null to ungroup
 * @returns {Promise<Object>} - Response message
 */
export const moveHandout = async (gameId, handoutId, folderId) => {
  const response = await axiosInstance.put(`/games/${gameId}/handouts/${handoutId}/move`, { folderId });
  return response.data;
};

/**
 * Reorder handout folders
 * @param {string} gameId - The game ID
 * @param {string[]} folderIds - Array of folder IDs in the new order
 * @returns {Promise<Object>} - Response message
 */
export const reorderHandoutFolders = async (gameId, folderIds) => {
  const response = await axiosInstance.put(`/games/${gameId}/handout-folders/reorder`, { folderIds });
  return response.data;
};

const handoutsApi = {
  uploadHandoutFile,
  createHandout,
  getHandouts,
  updateHandout,
  deleteHandout,
  reorderHandouts,
  createHandoutFolder,
  renameHandoutFolder,
  deleteHandoutFolder,
  moveHandout,
  reorderHandoutFolders,
};

export default handoutsApi;
