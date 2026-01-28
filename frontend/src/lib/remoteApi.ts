import type { UpdateIssueRequest } from 'shared/remote-types';
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

// =============================================================================
// Bulk Update Issues
// =============================================================================

export interface BulkUpdateIssueItem {
  id: string;
  changes: Partial<UpdateIssueRequest>;
}

/**
 * Bulk update multiple issues with arbitrary fields.
 * Project is inferred from the first issue; all issues must belong to the same project.
 */
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
