// Base URL and common headers, kept apart from api/axios.js so that modules which only need
// to build a URL (utils/fileUrl.js) do not pull in the axios client — jest under CRA cannot
// parse axios's ESM build.
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

export const getApiUrl = () => API_BASE_URL;

// Helper function to get headers with ngrok bypass
export const getApiHeaders = (additionalHeaders = {}) => ({
    'ngrok-skip-browser-warning': 'true',
    ...additionalHeaders
});
