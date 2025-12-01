import { oauthApi, ApiError } from './api';
import { UserData, AssigneesQuery } from 'shared/types';

const makeRequest = async (url: string, options: RequestInit = {}) => {
  const tokenRes = await oauthApi.getToken();
  if (!tokenRes?.access_token) {
    throw new Error('Not authenticated');
  }

  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${tokenRes.access_token}`);

  return fetch(url, {
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
