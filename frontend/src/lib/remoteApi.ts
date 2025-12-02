import { oauthApi, ApiError } from './api';
import { UserData, AssigneesQuery } from 'shared/types';

export const REMOTE_API_URL = import.meta.env.VITE_VK_SHARED_API_BASE || '';

const makeRequest = async (path: string, options: RequestInit = {}) => {
  const tokenRes = await oauthApi.getToken();
  if (!tokenRes?.access_token) {
    throw new Error('Not authenticated');
  }

  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${tokenRes.access_token}`);

  console.log('VITE_VK_SHARED_API_BASE:', REMOTE_API_URL);

  return fetch(`${REMOTE_API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
};

export const getSharedTaskAssignees = async (
  projectId: string
): Promise<UserData[]> => {
  const response = await makeRequest(
    `/v1/tasks/assignees?${new URLSearchParams({
      project_id: projectId,
    } as AssigneesQuery)}`
  );

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const err = await response.json();
      if (err?.message) message = err.message;
    } catch {
      // empty
    }
    throw new ApiError(message, response.status, response);
  }
  return response.json();
};
