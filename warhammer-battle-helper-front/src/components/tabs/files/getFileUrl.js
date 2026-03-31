import { getApiUrl } from '../../../api/axios';

export const getFileUrl = (fileUrl) => {
  if (!fileUrl) return '';
  return fileUrl.startsWith('http') ? fileUrl : `${getApiUrl()}${fileUrl}`;
};
