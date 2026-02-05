import type {
  UpdateIssueRequest,
  UpdateProjectStatusRequest,
} from 'shared/remote-types';
import { tokenManager } from './auth/tokenManager';

export const REMOTE_API_URL = import.meta.env.VITE_VK_SHARED_API_BASE || '';

export const makeRequest = async (
  path: string,
  options: RequestInit = {},
  retryOn401 = true
): Promise<Response> => {
  const token = await tokenManager.getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-Client-Version', __APP_VERSION__);
  headers.set('X-Client-Type', 'frontend');

  const response = await fetch(`${REMOTE_API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Handle 401 - token may have expired
  if (response.status === 401 && retryOn401) {
    const newToken = await tokenManager.triggerRefresh();
    if (newToken) {
      // Retry the request with the new token
      headers.set('Authorization', `Bearer ${newToken}`);
      return fetch(`${REMOTE_API_URL}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
    // Refresh failed, throw an auth error
    throw new Error('Session expired. Please log in again.');
  }

  return response;
};

export interface BulkUpdateIssueItem {
  id: string;
  changes: Partial<UpdateIssueRequest>;
}

export async function bulkUpdateIssues(
  updates: BulkUpdateIssueItem[]
): Promise<void> {
  const response = await makeRequest('/v1/issues/bulk', {
    method: 'POST',
    body: JSON.stringify({
      updates: updates.map((u) => ({ id: u.id, ...u.changes })),
    }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to bulk update issues');
  }
}

export interface BulkUpdateProjectStatusItem {
  id: string;
  changes: Partial<UpdateProjectStatusRequest>;
}

export async function bulkUpdateProjectStatuses(
  updates: BulkUpdateProjectStatusItem[]
): Promise<void> {
  const response = await makeRequest('/v1/project_statuses/bulk', {
    method: 'POST',
    body: JSON.stringify({
      updates: updates.map((u) => ({ id: u.id, ...u.changes })),
    }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to bulk update project statuses');
  }
}
