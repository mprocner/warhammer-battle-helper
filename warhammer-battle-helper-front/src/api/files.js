import axiosInstance from './axios';

/**
 * Get all files and folders for the current user
 * @returns {Promise<{files: Object[], folders: Object[]}>} - Files and folders
 */
export const getFiles = async () => {
  const response = await axiosInstance.get('/files');
  return response.data;
};

/**
 * Upload multiple image files
 * @param {File[]} files - Array of files to upload
 * @param {string|null} folderId - Target folder ID (null for root)
 * @returns {Promise<{files: Object[], errors: string[]}>} - Uploaded files and any errors
 */
export const uploadFiles = async (files, folderId = null) => {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  if (folderId) {
    formData.append('folderId', folderId);
  }

  const response = await axiosInstance.post('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

  return response.data;
};

/**
 * Delete a file
 * @param {string} fileId - The file ID to delete
 * @returns {Promise<Object>} - Response message
 */
export const deleteFile = async (fileId) => {
  const response = await axiosInstance.delete(`/files/${fileId}`);
  return response.data;
};

/**
 * Get games where a file is used
 * @param {string} fileId - The file ID to check
 * @returns {Promise<{games: string[]}>} - Game names using this file
 */
export const getFileUsage = async (fileId) => {
  const response = await axiosInstance.get(`/files/${fileId}/usage`);
  return response.data;
};

/**
 * Move a file to another folder
 * @param {string} fileId - The file ID to move
 * @param {string|null} folderId - Target folder ID (null for root)
 * @returns {Promise<Object>} - Response message
 */
export const moveFile = async (fileId, folderId = null) => {
  const response = await axiosInstance.put(`/files/${fileId}/move`, { folderId });
  return response.data;
};

/**
 * Create a new folder
 * @param {string} name - Folder name
 * @param {string|null} parentId - Parent folder ID (null for root)
 * @returns {Promise<Object>} - The created folder
 */
export const createFolder = async (name, parentId = null) => {
  const response = await axiosInstance.post('/folders', { name, parentId });
  return response.data;
};

/**
 * Rename a folder
 * @param {string} folderId - The folder ID
 * @param {string} name - New folder name
 * @returns {Promise<Object>} - Response message
 */
export const renameFolder = async (folderId, name) => {
  const response = await axiosInstance.put(`/folders/${folderId}`, { name });
  return response.data;
};

/**
 * Delete a folder
 * @param {string} folderId - The folder ID to delete
 * @param {boolean} deleteContents - Whether to delete folder contents
 * @returns {Promise<Object>} - Response message
 */
export const deleteFolder = async (folderId, deleteContents = false) => {
  const response = await axiosInstance.delete(`/folders/${folderId}`, {
    params: { deleteContents }
  });
  return response.data;
};

const filesApi = {
  getFiles,
  uploadFiles,
  deleteFile,
  getFileUsage,
  moveFile,
  createFolder,
  renameFolder,
  deleteFolder
};

export default filesApi;
