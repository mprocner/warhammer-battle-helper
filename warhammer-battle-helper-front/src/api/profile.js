import axiosInstance from './axios';

export const getProfile = async () => {
    const response = await axiosInstance.get('/profile');
    return response.data;
};

export const updateProfile = async ({ avatar, signature }) => {
    const response = await axiosInstance.patch('/profile', { avatar, signature });
    return response.data;
};

export const updateGameParticipant = async (gameId, { avatar, signature }) => {
    const response = await axiosInstance.patch(`/games/${gameId}/participant`, { avatar, signature });
    return response.data;
};
