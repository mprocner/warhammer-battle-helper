import axiosInstance from './axios';

export const getSettings = () => axiosInstance.get('/settings').then(r => r.data);

export const updateSettings = (settings) =>
  axiosInstance.patch('/settings', settings).then(r => r.data);
