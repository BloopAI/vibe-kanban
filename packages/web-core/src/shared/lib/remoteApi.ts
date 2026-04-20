import type {
  AttachmentWithBlob,
  CommitAttachmentsRequest,
  CommitAttachmentsResponse,
  ConfirmUploadRequest,
  InitUploadRequest,
  InitUploadResponse,
  ListRelayHostsResponse,
  RelayHost,
  UpdateIssueRequest,
  UpdateProjectRequest,
  UpdateProjectStatusRequest,
} from 'shared/remote-types';
import { getAuthRuntime } from '@/shared/lib/auth/runtime';
import { syncRelayApiBaseWithRemote } from '@/shared/lib/relayBackendApi';

const BUILD_TIME_API_BASE = import.meta.env.VITE_VK_SHARED_API_BASE || '';

// Mutable module-level variable — overridden at runtime by ConfigProvider
// when VK_SHARED_API_BASE is set (for self-hosting support)
let _remoteApiBase: string = BUILD_TIME_API_BASE;

/**
 * Set the remote API base URL at runtime.
 * Called by ConfigProvider when /api/info returns a shared_api_base value.
 * No-op if base is null/undefined/empty (preserves build-time fallback).
 */
export function setRemoteApiBase(base: string | null | undefined) {
  _remoteApiBase = base || BUILD_TIME_API_BASE;
  if (_remoteApiBase) {
    syncRelayApiBaseWithRemote(_remoteApiBase);
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

export const makeRequest = async (
  path: string,
  options: RequestInit = {},
  retryOn401 = true
): Promise<Response> => {
  return makeAuthenticatedRequest(getRemoteApiUrl(), path, options, retryOn401);
};

async function makeAuthenticatedRequest(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
  retryOn401 = true
): Promise<Response> {
  // In local-first mode there is no remote API base and no auth token.
  // Return a synthetic 501 so callers that check `response.ok` fail
  // gracefully, and avoid throwing an unhandled rejection that React Query
  // surfaces as a visible error banner.
  if (!baseUrl) {
    return new Response(
      JSON.stringify({ error: 'Local-first mode — remote API not available' }),
      {
        status: 501,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const authRuntime = getAuthRuntime();
  const token = await authRuntime.getToken();
  if (!token) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-Client-Version', __APP_VERSION__);
  headers.set('X-Client-Type', 'frontend');

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Handle 401 - token may have expired
  if (response.status === 401 && retryOn401) {
    const newToken = await authRuntime.triggerRefresh();
    if (newToken) {
      // Retry the request with the new token
      headers.set('Authorization', `Bearer ${newToken}`);
      return fetch(`${baseUrl}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
    // Refresh failed, throw an auth error
    throw new Error('Session expired. Please log in again.');
  }

  return response;
}

export interface BulkUpdateIssueItem {
  id: string;
  changes: Partial<UpdateIssueRequest>;
}

export interface BulkUpdateProjectItem {
  id: string;
  changes: Partial<UpdateProjectRequest>;
}

export async function bulkUpdateProjects(
  _updates: BulkUpdateProjectItem[]
): Promise<void> {
  // No-op in local-first mode — cloud project sync is not available.
}

export async function bulkUpdateIssues(
  updates: BulkUpdateIssueItem[]
): Promise<void> {
  if (!updates.length) return;
  const { kanbanIssuesApi } = await import('@/shared/lib/kanbanApi');
  await kanbanIssuesApi.bulkUpdate(
    updates.map((u) => ({
      id: u.id,
      status_id: u.changes.status_id ?? null,
      sort_order: u.changes.sort_order ?? null,
      title: u.changes.title ?? null,
      description: u.changes.description ?? null,
      priority: (u.changes.priority ?? null) as
        | import('shared/types').KanbanIssuePriority
        | null,
    }))
  );
}

export interface BulkUpdateProjectStatusItem {
  id: string;
  changes: Partial<UpdateProjectStatusRequest>;
}

export async function bulkUpdateProjectStatuses(
  _updates: BulkUpdateProjectStatusItem[]
): Promise<void> {
  // No-op in local-first mode — cloud project status sync is not available.
}

// ---------------------------------------------------------------------------
// Relay host API functions (served by remote backend)
// ---------------------------------------------------------------------------

export async function listRelayHosts(): Promise<RelayHost[]> {
  if (!getRemoteApiUrl()) return [];
  const response = await makeRequest('/v1/hosts', { method: 'GET' });
  if (!response.ok) {
    throw await parseErrorResponse(response, 'Failed to list relay hosts');
  }

  const body = (await response.json()) as ListRelayHostsResponse;
  return body.hosts;
}

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
  _params: InitUploadRequest
): Promise<InitUploadResponse> {
  throw new Error(
    'Cloud attachment upload is not available in local-first mode.'
  );
}

export async function confirmAttachmentUpload(
  _params: ConfirmUploadRequest
): Promise<AttachmentWithBlob> {
  throw new Error(
    'Cloud attachment upload is not available in local-first mode.'
  );
}

export async function commitIssueAttachments(
  _issueId: string,
  _request: CommitAttachmentsRequest
): Promise<CommitAttachmentsResponse> {
  return { attachments: [] };
}

export async function commitCommentAttachments(
  _commentId: string,
  _request: CommitAttachmentsRequest
): Promise<CommitAttachmentsResponse> {
  return { attachments: [] };
}

export async function deleteAttachment(_attachmentId: string): Promise<void> {
  // No-op in local-first mode — cloud attachments are not available.
}

export async function fetchAttachmentSasUrl(
  _attachmentId: string,
  _type: 'file' | 'thumbnail'
): Promise<string> {
  throw new Error(
    'Cloud attachment URLs are not available in local-first mode.'
  );
}
