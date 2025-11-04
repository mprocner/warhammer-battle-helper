import axios from 'axios';

// Use environment variable or fallback to localhost
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

console.log('API Base URL:', API_BASE_URL);

// Create axios instance
const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    headers: {
        'ngrok-skip-browser-warning': 'true'  // Skip ngrok warning page
    }
});

// Export the base URL for use in fetch calls
export const getApiUrl = () => API_BASE_URL;

// Helper function to get headers with ngrok bypass
export const getApiHeaders = (additionalHeaders = {}) => ({
    'ngrok-skip-browser-warning': 'true',
    ...additionalHeaders
});

// Add request interceptor to attach token
axiosInstance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add response interceptor to handle 401 errors
axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token is invalid or expired
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default axiosInstance;
