import type {
  AttachmentUrlResponse,
  AttachmentWithBlob,
  CommitAttachmentsRequest,
  CommitAttachmentsResponse,
  ConfirmUploadRequest,
  InitUploadRequest,
  InitUploadResponse,
  UpdateIssueRequest,
  UpdateProjectRequest,
  UpdateProjectStatusRequest,
} from 'shared/remote-types';
import { getAuthRuntime } from '@/shared/lib/auth/runtime';

const BUILD_TIME_API_BASE = import.meta.env.VITE_VK_SHARED_API_BASE || '';
const AUTH_DEBUG_PREFIX = '[auth-debug][local-web][remote-api]';

// Mutable module-level variable — overridden at runtime by ConfigProvider
// when VK_SHARED_API_BASE is set (for self-hosting support)
let _remoteApiBase: string = BUILD_TIME_API_BASE;

/**
 * Set the remote API base URL at runtime.
 * Called by ConfigProvider when /api/info returns a shared_api_base value.
 * No-op if base is null/undefined/empty (preserves build-time fallback).
 */
export function setRemoteApiBase(base: string | null | undefined) {
  if (base) {
    _remoteApiBase = base;
  }
}

/**
 * Get the current remote API base URL.
 * Returns the runtime value if set by ConfigProvider, otherwise the build-time default.
 */
export function getRemoteApiUrl(): string {
  return _remoteApiBase;
}

// Backward-compatible export — consumers should migrate to getRemoteApiUrl()
export const REMOTE_API_URL = BUILD_TIME_API_BASE;

function authDebug(message: string, data?: unknown): void {
  if (data === undefined) {
    console.debug(`${AUTH_DEBUG_PREFIX} ${message}`);
    return;
  }
  console.debug(`${AUTH_DEBUG_PREFIX} ${message}`, data);
}

function headersToObject(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

async function responseBodySnapshot(response: Response): Promise<string> {
  try {
    return await response.clone().text();
  } catch (error) {
    return `<<failed to read response body: ${String(error)}>>`;
  }
}

export const makeRequest = async (
  path: string,
  options: RequestInit = {},
  retryOn401 = true
): Promise<Response> => {
  const method = options.method ?? 'GET';
  const requestUrl = `${getRemoteApiUrl()}${path}`;
  authDebug('makeRequest called', {
    path,
    requestUrl,
    method,
    retryOn401,
    options,
  });

  const authRuntime = getAuthRuntime();
  const token = await authRuntime.getToken();
  authDebug('authRuntime.getToken resolved', { token });
  if (!token) {
    authDebug('makeRequest aborting: token missing');
    throw new Error('Not authenticated');
  }

  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-Client-Version', __APP_VERSION__);
  headers.set('X-Client-Type', 'frontend');

  authDebug('dispatching request', {
    requestUrl,
    method,
    headers: headersToObject(headers),
    body: options.body,
  });

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (error) {
    authDebug('request failed before receiving response', {
      requestUrl,
      method,
      error,
    });
    throw error;
  }

  authDebug('received response', {
    requestUrl,
    method,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    responseUrl: response.url,
    headers: headersToObject(response.headers),
  });
  if (!response.ok) {
    authDebug('response body snapshot (initial request)', {
      body: await responseBodySnapshot(response),
    });
  }

  // Handle 401 - token may have expired
  if (response.status === 401 && retryOn401) {
    authDebug('received 401, triggering auth refresh and retry', {
      requestUrl,
      method,
      originalResponseBody: await responseBodySnapshot(response),
    });
    const newToken = await authRuntime.triggerRefresh();
    authDebug('authRuntime.triggerRefresh resolved', { newToken });
    if (newToken) {
      // Retry the request with the new token
      headers.set('Authorization', `Bearer ${newToken}`);
      authDebug('retrying request after refresh', {
        requestUrl,
        method,
        headers: headersToObject(headers),
      });

      const retryResponse = await fetch(requestUrl, {
        ...options,
        headers,
        credentials: 'include',
      });
      authDebug('retry response received', {
        requestUrl,
        method,
        status: retryResponse.status,
        statusText: retryResponse.statusText,
        ok: retryResponse.ok,
        responseUrl: retryResponse.url,
        headers: headersToObject(retryResponse.headers),
      });
      if (!retryResponse.ok) {
        authDebug('response body snapshot (retry request)', {
          body: await responseBodySnapshot(retryResponse),
        });
      }
      return retryResponse;
    }
    // Refresh failed, throw an auth error
    authDebug('refresh failed to return token; throwing session expired error');
    throw new Error('Session expired. Please log in again.');
  }

  return response;
};

export interface BulkUpdateIssueItem {
  id: string;
  changes: Partial<UpdateIssueRequest>;
}

export interface BulkUpdateProjectItem {
  id: string;
  changes: Partial<UpdateProjectRequest>;
}

export async function bulkUpdateProjects(
  updates: BulkUpdateProjectItem[]
): Promise<void> {
  const response = await makeRequest('/v1/projects/bulk', {
    method: 'POST',
    body: JSON.stringify({
      updates: updates.map((u) => ({ id: u.id, ...u.changes })),
    }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to bulk update projects');
  }
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

// ---------------------------------------------------------------------------
// SAS URL cache with TTL — SAS URLs expire after 5 minutes, cache for 4
// ---------------------------------------------------------------------------

const SAS_URL_TTL_MS = 4 * 60 * 1000;

interface CachedSasUrl {
  url: string;
  expiresAt: number;
}

const sasUrlCache = new Map<string, CachedSasUrl>();

// ---------------------------------------------------------------------------
// Utility: SHA-256 file hash
// ---------------------------------------------------------------------------

export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Utility: Upload to Azure Blob Storage with progress
// ---------------------------------------------------------------------------

export function uploadToAzure(
  uploadUrl: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
    xhr.setRequestHeader('Content-Type', file.type);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status === 201) {
        resolve();
      } else {
        reject(
          new Error(
            `Azure upload failed with status ${xhr.status}: ${xhr.statusText}`
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error('Azure upload failed: network error'));
    };

    xhr.send(file);
  });
}

// ---------------------------------------------------------------------------
// Utility: safe error response parsing (handles non-JSON error bodies)
// ---------------------------------------------------------------------------

async function parseErrorResponse(
  response: Response,
  fallbackMessage: string
): Promise<Error> {
  try {
    const body = await response.json();
    const message = body.error || body.message || fallbackMessage;
    return new Error(`${message} (${response.status} ${response.statusText})`);
  } catch {
    return new Error(
      `${fallbackMessage} (${response.status} ${response.statusText})`
    );
  }
}

// ---------------------------------------------------------------------------
// Attachment API functions
// ---------------------------------------------------------------------------

export async function initAttachmentUpload(
  params: InitUploadRequest
): Promise<InitUploadResponse> {
  const response = await makeRequest('/v1/attachments/init', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw await parseErrorResponse(
      response,
      'Failed to init attachment upload'
    );
  }
  return response.json();
}

export async function confirmAttachmentUpload(
  params: ConfirmUploadRequest
): Promise<AttachmentWithBlob> {
  const response = await makeRequest('/v1/attachments/confirm', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw await parseErrorResponse(
      response,
      'Failed to confirm attachment upload'
    );
  }
  return response.json();
}

export async function commitIssueAttachments(
  issueId: string,
  request: CommitAttachmentsRequest
): Promise<CommitAttachmentsResponse> {
  const response = await makeRequest(
    `/v1/issues/${issueId}/attachments/commit`,
    {
      method: 'POST',
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw await parseErrorResponse(
      response,
      'Failed to commit issue attachments'
    );
  }
  return response.json();
}

export async function commitCommentAttachments(
  commentId: string,
  request: CommitAttachmentsRequest
): Promise<CommitAttachmentsResponse> {
  const response = await makeRequest(
    `/v1/comments/${commentId}/attachments/commit`,
    {
      method: 'POST',
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw await parseErrorResponse(
      response,
      'Failed to commit comment attachments'
    );
  }
  return response.json();
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  const response = await makeRequest(`/v1/attachments/${attachmentId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw await parseErrorResponse(response, 'Failed to delete attachment');
  }
}

export async function fetchAttachmentSasUrl(
  attachmentId: string,
  type: 'file' | 'thumbnail'
): Promise<string> {
  const cacheKey = `${attachmentId}:${type}`;
  const cached = sasUrlCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.url;
  }

  const response = await makeRequest(`/v1/attachments/${attachmentId}/${type}`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch attachment ${type}: ${response.statusText}`
    );
  }

  const data: AttachmentUrlResponse = await response.json();
  sasUrlCache.set(cacheKey, {
    url: data.url,
    expiresAt: Date.now() + SAS_URL_TTL_MS,
  });
  return data.url;
}
