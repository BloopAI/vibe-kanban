import { oauthApi } from './api';

export const REMOTE_API_URL = import.meta.env.VITE_VK_SHARED_API_BASE || '';

export const makeRequest = async (path: string, options: RequestInit = {}) => {
  const tokenRes = await oauthApi.getToken();
  if (!tokenRes?.access_token) {
    throw new Error('Not authenticated');
  }

  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${tokenRes.access_token}`);

  return fetch(`${REMOTE_API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
};
