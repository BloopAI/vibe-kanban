// Import all necessary types from shared types

import {
  ApprovalStatus,
  ApiResponse,
  Config,
  CreateFollowUpAttempt,
  EditorType,
  CreateGitHubPrRequest,
  CreateTask,
  CreateAndStartTaskRequest,
  CreateTaskAttemptBody,
  CreateTag,
  DirectoryListResponse,
  DirectoryEntry,
  ExecutionProcess,
  ExecutionProcessRepoState,
  GitBranch,
  Project,
  ProjectRepo,
  Repo,
  RepoWithTargetBranch,
  CreateProject,
  CreateProjectRepo,
  UpdateProjectRepo,
  SearchResult,
  ShareTaskResponse,
  Task,
  TaskRelationships,
  Tag,
  TagSearchParams,
  TaskWithAttemptStatus,
  UpdateProject,
  UpdateTask,
  UpdateTag,
  UserSystemInfo,
  McpServerQuery,
  UpdateMcpServersBody,
  GetMcpServerResponse,
  ImageResponse,
  GitOperationError,
  ApprovalResponse,
  RebaseTaskAttemptRequest,
  ChangeTargetBranchRequest,
  ChangeTargetBranchResponse,
  RenameBranchRequest,
  RenameBranchResponse,
  CheckEditorAvailabilityResponse,
  AvailabilityInfo,
  BaseCodingAgent,
  RunAgentSetupRequest,
  RunAgentSetupResponse,
  GhCliSetupError,
  RunScriptError,
  StatusResponse,
  ListOrganizationsResponse,
  OrganizationMemberWithProfile,
  ListMembersResponse,
  RemoteProjectMembersResponse,
  CreateOrganizationRequest,
  CreateOrganizationResponse,
  CreateInvitationRequest,
  CreateInvitationResponse,
  RevokeInvitationRequest,
  UpdateMemberRoleRequest,
  CreateRemoteProjectRequest,
  LinkToExistingRequest,
  UpdateMemberRoleResponse,
  Invitation,
  RemoteProject,
  ListInvitationsResponse,
  OpenEditorResponse,
  OpenEditorRequest,
  CreatePrError,
  Scratch,
  ScratchType,
  CreateScratch,
  UpdateScratch,
  PushError,
  TokenResponse,
  CurrentUserResponse,
  SharedTaskResponse,
  SharedTaskDetails,
  QueueStatus,
  PrCommentsResponse,
  MergeTaskAttemptRequest,
  PushTaskAttemptRequest,
  RepoBranchStatus,
  AbortConflictsRequest,
  Session,
  Workspace,
  Team,
  TeamProject,
  CreateTeam,
  UpdateTeam,
  TeamProjectAssignment,
  MigrateTasksRequest,
  MigrateTasksResponse,
  ValidateStoragePathRequest,
  ValidateStoragePathResponse,
  InboxItem,
  CreateInboxItem,
  InboxSummary,
  Document,
  DocumentFolder,
  CreateDocument,
  UpdateDocument,
  CreateDocumentFolder,
  UpdateDocumentFolder,
  GitHubConnection,
  GitHubConnectionWithRepos,
  GitHubRepository,
  CreateGitHubConnection,
  UpdateGitHubConnection,
  LinkGitHubRepository,
  GitHubAuthorizeResponse,
  GitHubRepoInfo,
  ConfigureSyncRequest,
  PushDocumentsRequest,
  SyncOperationResponse,
  ScanFilesystemResponse,
  ScanAllResponse,
  DiscoverFoldersResponse,
  DocumentContentResponse,
  GitHubRepoSyncConfig,
  ConfigureMultiFolderSync,
  TeamMember,
  CreateTeamMember,
  UpdateTeamMemberRole,
  SyncClerkMember,
  TeamInvitation,
  TeamInvitationWithTeam,
  CreateTeamInvitation,
  UpdateTeamInvitation,
  InvitationByTokenResponse,
  TaskComment,
  CreateTaskComment,
  UpdateTaskComment,
  LinkedDocument,
  LinkDocumentsRequest,
  UploadResult,
  UserRegistration,
  CreateUserRegistration,
} from 'shared/types';

export interface SignedUrlResponse {
  url: string;
  storage_provider: string;
  expires_in: number;
  file_path?: string;
}
export type { TeamMemberRole } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import type {
  TenantWorkspace,
  TenantWorkspaceMember,
  CreateTenantWorkspace,
  UpdateTenantWorkspace,
  AddWorkspaceMember,
  UpdateWorkspaceMemberRole,
} from '@/types/workspace';
import { createWorkspaceWithSession } from '@/types/attempt';

// API Key types (defined locally since backend generates these via ts-rs)
export interface ApiKeyInfo {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  is_revoked: boolean;
  created_at: string;
}

export interface ApiKeyWithSecret {
  id: string;
  name: string;
  key_prefix: string;
  key: string;
  expires_at: string | null;
  created_at: string;
}

export interface CreateApiKeyRequest {
  name: string;
  expires_in_days?: number;
}

export class ApiError<E = unknown> extends Error {
  public status?: number;
  public error_data?: E;

  constructor(
    message: string,
    public statusCode?: number,
    public response?: Response,
    error_data?: E
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = statusCode;
    this.error_data = error_data;
  }
}

// API base URL - use environment variable or default to relative path
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Helper to build full API URL
const buildApiUrl = (path: string): string => {
  if (API_BASE_URL) {
    return `${API_BASE_URL}${path}`;
  }
  return path;
};

// Auth token getter - can be set by React components
let authTokenGetter: (() => Promise<string | null>) | null = null;

/**
 * Set the auth token getter function.
 * Call this from your React app with Clerk's getToken function.
 * Example: setAuthTokenGetter(() => getToken())
 */
export const setAuthTokenGetter = (getter: () => Promise<string | null>) => {
  authTokenGetter = getter;
};

/**
 * Get the current auth token (if available)
 */
export const getAuthToken = async (): Promise<string | null> => {
  if (!authTokenGetter) {
    return null;
  }
  try {
    return await authTokenGetter();
  } catch (e) {
    console.warn('Failed to get auth token:', e);
    return null;
  }
};

// Retry configuration - DO NOT retry 429 rate limits (it amplifies the problem)
const RETRY_CONFIG = {
  maxRetries: 1, // Only 1 retry for server errors
  baseDelayMs: 2000, // 2 seconds
  maxDelayMs: 5000,  // 5 seconds max
  retryableStatuses: [503, 502, 504], // Server errors only - NOT 429!
};

/**
 * Sleep for a given number of milliseconds
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calculate exponential backoff delay with jitter
 */
const getBackoffDelay = (attempt: number): number => {
  const exponentialDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
  return Math.min(exponentialDelay + jitter, RETRY_CONFIG.maxDelayMs);
};

// Global Request Queue to prevent 429 Rate Limits
class RequestQueue {
  private queue: Array<() => Promise<void>> = [];
  private activeCount = 0;
  private readonly MAX_CONCURRENT = 2;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = async () => {
        this.activeCount++;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.activeCount--;
          this.processNext();
        }
      };

      if (this.activeCount < this.MAX_CONCURRENT) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  private processNext() {
    if (this.queue.length > 0 && this.activeCount < this.MAX_CONCURRENT) {
      const next = this.queue.shift();
      next?.();
    }
  }
}

const globalQueue = new RequestQueue();

const makeRequest = async (url: string, options: RequestInit = {}) => {
  return globalQueue.add(async () => {
    const headers = new Headers(options.headers ?? {});
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    // Add Authorization header if token is available
    const token = await getAuthToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const fullUrl = buildApiUrl(url);

    // Retry logic with exponential backoff for rate limiting
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        const response = await fetch(fullUrl, {
          ...options,
          headers,
        });

        // If not a retryable status, return immediately
        if (!RETRY_CONFIG.retryableStatuses.includes(response.status)) {
          return response;
        }

        // If we've exhausted retries, return the response anyway
        if (attempt >= RETRY_CONFIG.maxRetries) {
          console.warn(
            `[API] Max retries (${RETRY_CONFIG.maxRetries}) reached for ${url}, returning response with status ${response.status}`
          );
          return response;
        }

        // Calculate backoff delay
        const delay = getBackoffDelay(attempt);
        console.warn(
          `[API] Received ${response.status} for ${url}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})`
        );
        await sleep(delay);
      } catch (error) {
        lastError = error as Error;
        // Network errors - also retry with backoff
        if (attempt >= RETRY_CONFIG.maxRetries) {
          throw error;
        }
        const delay = getBackoffDelay(attempt);
        console.warn(
          `[API] Network error for ${url}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries}):`,
          error
        );
        await sleep(delay);
      }
    }

    // This shouldn't be reached, but TypeScript needs it
    throw lastError || new Error(`Failed to fetch ${url} after ${RETRY_CONFIG.maxRetries} retries`);
  });
};

export type Ok<T> = { success: true; data: T };
export type Err<E> = { success: false; error: E | undefined; message?: string };

// Result type for endpoints that need typed errors
export type Result<T, E> = Ok<T> | Err<E>;

// Special handler for Result-returning endpoints
const handleApiResponseAsResult = async <T, E>(
  response: Response
): Promise<Result<T, E>> => {
  if (!response.ok) {
    // HTTP error - no structured error data
    let errorMessage = `Request failed with status ${response.status}`;

    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      errorMessage = response.statusText || errorMessage;
    }

    return {
      success: false,
      error: undefined,
      message: errorMessage,
    };
  }

  const result: ApiResponse<T, E> = await response.json();

  if (!result.success) {
    return {
      success: false,
      error: result.error_data || undefined,
      message: result.message || undefined,
    };
  }

  return { success: true, data: result.data as T };
};

export const handleApiResponse = async <T, E = T>(
  response: Response
): Promise<T> => {
  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;

    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // Fallback to status text if JSON parsing fails
      errorMessage = response.statusText || errorMessage;
    }

    console.error('[API Error]', {
      message: errorMessage,
      status: response.status,
      response,
      endpoint: response.url,
      timestamp: new Date().toISOString(),
    });
    throw new ApiError<E>(errorMessage, response.status, response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const result: ApiResponse<T, E> = await response.json();

  if (!result.success) {
    // Check for error_data first (structured errors), then fall back to message
    if (result.error_data) {
      console.error('[API Error with data]', {
        error_data: result.error_data,
        message: result.message,
        status: response.status,
        response,
        endpoint: response.url,
        timestamp: new Date().toISOString(),
      });
      // Throw a properly typed error with the error data
      throw new ApiError<E>(
        result.message || 'API request failed',
        response.status,
        response,
        result.error_data
      );
    }

    console.error('[API Error]', {
      message: result.message || 'API request failed',
      status: response.status,
      response,
      endpoint: response.url,
      timestamp: new Date().toISOString(),
    });
    throw new ApiError<E>(
      result.message || 'API request failed',
      response.status,
      response
    );
  }

  return result.data as T;
};

// Project Management APIs
export const projectsApi = {
  get: async (id: string): Promise<Project> => {
    const response = await makeRequest(`/api/projects/${id}`);
    return handleApiResponse<Project>(response);
  },

  getMany: async (ids: string[]): Promise<Project[]> => {
    // Throttle requests to avoid rate limits (429)
    // Process in batches of 3
    const BATCH_SIZE = 3;
    const results: (Project | null)[] = [];

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (id) => {
          try {
            return await projectsApi.get(id);
          } catch {
            return null;
          }
        })
      );
      results.push(...batchResults);
    }

    return results.filter((p): p is Project => p !== null);
  },

  create: async (data: CreateProject): Promise<Project> => {
    const response = await makeRequest('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Project>(response);
  },

  update: async (id: string, data: UpdateProject): Promise<Project> => {
    const response = await makeRequest(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Project>(response);
  },

  getRemoteMembers: async (
    projectId: string
  ): Promise<RemoteProjectMembersResponse> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/remote/members`
    );
    return handleApiResponse<RemoteProjectMembersResponse>(response);
  },

  delete: async (id: string): Promise<void> => {
    const response = await makeRequest(`/api/projects/${id}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  openEditor: async (
    id: string,
    data: OpenEditorRequest
  ): Promise<OpenEditorResponse> => {
    const response = await makeRequest(`/api/projects/${id}/open-editor`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<OpenEditorResponse>(response);
  },

  searchFiles: async (
    id: string,
    query: string,
    mode?: string,
    options?: RequestInit
  ): Promise<SearchResult[]> => {
    const modeParam = mode ? `&mode=${encodeURIComponent(mode)}` : '';
    const response = await makeRequest(
      `/api/projects/${id}/search?q=${encodeURIComponent(query)}${modeParam}`,
      options
    );
    return handleApiResponse<SearchResult[]>(response);
  },

  linkToExisting: async (
    localProjectId: string,
    data: LinkToExistingRequest
  ): Promise<Project> => {
    const response = await makeRequest(`/api/projects/${localProjectId}/link`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Project>(response);
  },

  createAndLink: async (
    localProjectId: string,
    data: CreateRemoteProjectRequest
  ): Promise<Project> => {
    const response = await makeRequest(
      `/api/projects/${localProjectId}/link/create`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<Project>(response);
  },

  unlink: async (projectId: string): Promise<Project> => {
    const response = await makeRequest(`/api/projects/${projectId}/link`, {
      method: 'DELETE',
    });
    return handleApiResponse<Project>(response);
  },

  getRepositories: async (projectId: string): Promise<Repo[]> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/repositories`
    );
    return handleApiResponse<Repo[]>(response);
  },

  addRepository: async (
    projectId: string,
    data: CreateProjectRepo
  ): Promise<Repo> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/repositories`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<Repo>(response);
  },

  deleteRepository: async (
    projectId: string,
    repoId: string
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/repositories/${repoId}`,
      {
        method: 'DELETE',
      }
    );
    return handleApiResponse<void>(response);
  },

  getRepository: async (
    projectId: string,
    repoId: string
  ): Promise<ProjectRepo> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/repositories/${repoId}`
    );
    return handleApiResponse<ProjectRepo>(response);
  },

  updateRepository: async (
    projectId: string,
    repoId: string,
    data: UpdateProjectRepo
  ): Promise<ProjectRepo> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/repositories/${repoId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<ProjectRepo>(response);
  },
};

// Task Management APIs
export const tasksApi = {
  getById: async (taskId: string): Promise<Task> => {
    const response = await makeRequest(`/api/tasks/${taskId}`);
    return handleApiResponse<Task>(response);
  },

  create: async (data: CreateTask): Promise<Task> => {
    const response = await makeRequest(`/api/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Task>(response);
  },

  createAndStart: async (
    data: CreateAndStartTaskRequest
  ): Promise<TaskWithAttemptStatus> => {
    const response = await makeRequest(`/api/tasks/create-and-start`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TaskWithAttemptStatus>(response);
  },

  update: async (taskId: string, data: UpdateTask): Promise<Task> => {
    const response = await makeRequest(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Task>(response);
  },

  delete: async (taskId: string): Promise<void> => {
    const response = await makeRequest(`/api/tasks/${taskId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  share: async (taskId: string): Promise<ShareTaskResponse> => {
    const response = await makeRequest(`/api/tasks/${taskId}/share`, {
      method: 'POST',
    });
    return handleApiResponse<ShareTaskResponse>(response);
  },

  reassign: async (
    sharedTaskId: string,
    data: { new_assignee_user_id: string | null }
  ): Promise<SharedTaskResponse> => {
    const payload = {
      new_assignee_user_id: data.new_assignee_user_id,
    };

    const response = await makeRequest(
      `/api/shared-tasks/${sharedTaskId}/assign`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );

    return handleApiResponse<SharedTaskResponse>(response);
  },

  unshare: async (sharedTaskId: string): Promise<void> => {
    const response = await makeRequest(`/api/shared-tasks/${sharedTaskId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  linkToLocal: async (data: SharedTaskDetails): Promise<Task | null> => {
    const response = await makeRequest(`/api/shared-tasks/link-to-local`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Task | null>(response);
  },

  move: async (taskId: string, newProjectId: string): Promise<Task> => {
    const response = await makeRequest(`/api/tasks/${taskId}/move`, {
      method: 'POST',
      body: JSON.stringify({ project_id: newProjectId }),
    });
    return handleApiResponse<Task>(response);
  },

  // Task comments
  getComments: async (taskId: string): Promise<TaskComment[]> => {
    const response = await makeRequest(`/api/tasks/${taskId}/comments`);
    return handleApiResponse<TaskComment[]>(response);
  },

  createComment: async (
    taskId: string,
    data: CreateTaskComment
  ): Promise<TaskComment> => {
    const response = await makeRequest(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TaskComment>(response);
  },

  updateComment: async (
    taskId: string,
    commentId: string,
    data: UpdateTaskComment
  ): Promise<TaskComment> => {
    const response = await makeRequest(
      `/api/tasks/${taskId}/comments/${commentId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<TaskComment>(response);
  },

  deleteComment: async (taskId: string, commentId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/tasks/${taskId}/comments/${commentId}`,
      {
        method: 'DELETE',
      }
    );
    return handleApiResponse<void>(response);
  },

  // Task document links
  getLinks: async (taskId: string): Promise<LinkedDocument[]> => {
    const response = await makeRequest(`/api/tasks/${taskId}/links`);
    return handleApiResponse<LinkedDocument[]>(response);
  },

  linkDocuments: async (
    taskId: string,
    data: LinkDocumentsRequest
  ): Promise<LinkedDocument[]> => {
    const response = await makeRequest(`/api/tasks/${taskId}/links`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<LinkedDocument[]>(response);
  },

  unlinkDocument: async (taskId: string, documentId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/tasks/${taskId}/links/${documentId}`,
      {
        method: 'DELETE',
      }
    );
    return handleApiResponse<void>(response);
  },
};

// Sessions API
export const sessionsApi = {
  getByWorkspace: async (workspaceId: string): Promise<Session[]> => {
    const response = await makeRequest(
      `/api/sessions?workspace_id=${workspaceId}`
    );
    return handleApiResponse<Session[]>(response);
  },

  getById: async (sessionId: string): Promise<Session> => {
    const response = await makeRequest(`/api/sessions/${sessionId}`);
    return handleApiResponse<Session>(response);
  },

  create: async (data: {
    workspace_id: string;
    executor?: string;
  }): Promise<Session> => {
    const response = await makeRequest('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Session>(response);
  },

  followUp: async (
    sessionId: string,
    data: CreateFollowUpAttempt
  ): Promise<ExecutionProcess> => {
    const response = await makeRequest(`/api/sessions/${sessionId}/follow-up`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<ExecutionProcess>(response);
  },
};

// Task Attempts APIs
export const attemptsApi = {
  getChildren: async (attemptId: string): Promise<TaskRelationships> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/children`
    );
    return handleApiResponse<TaskRelationships>(response);
  },

  getAll: async (taskId: string): Promise<Workspace[]> => {
    const response = await makeRequest(`/api/task-attempts?task_id=${taskId}`);
    return handleApiResponse<Workspace[]>(response);
  },

  get: async (attemptId: string): Promise<Workspace> => {
    const response = await makeRequest(`/api/task-attempts/${attemptId}`);
    return handleApiResponse<Workspace>(response);
  },

  /** Get workspace with latest session */
  getWithSession: async (attemptId: string): Promise<WorkspaceWithSession> => {
    const [workspace, sessions] = await Promise.all([
      attemptsApi.get(attemptId),
      sessionsApi.getByWorkspace(attemptId),
    ]);
    return createWorkspaceWithSession(workspace, sessions[0]);
  },

  create: async (data: CreateTaskAttemptBody): Promise<Workspace> => {
    const response = await makeRequest(`/api/task-attempts`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Workspace>(response);
  },

  stop: async (attemptId: string): Promise<void> => {
    const response = await makeRequest(`/api/task-attempts/${attemptId}/stop`, {
      method: 'POST',
    });
    return handleApiResponse<void>(response);
  },

  runAgentSetup: async (
    attemptId: string,
    data: RunAgentSetupRequest
  ): Promise<RunAgentSetupResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/run-agent-setup`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<RunAgentSetupResponse>(response);
  },

  openEditor: async (
    attemptId: string,
    data: OpenEditorRequest
  ): Promise<OpenEditorResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/open-editor`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<OpenEditorResponse>(response);
  },

  getBranchStatus: async (attemptId: string): Promise<RepoBranchStatus[]> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/branch-status`
    );
    return handleApiResponse<RepoBranchStatus[]>(response);
  },

  getRepos: async (attemptId: string): Promise<RepoWithTargetBranch[]> => {
    const response = await makeRequest(`/api/task-attempts/${attemptId}/repos`);
    return handleApiResponse<RepoWithTargetBranch[]>(response);
  },

  merge: async (
    attemptId: string,
    data: MergeTaskAttemptRequest
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/merge`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<void>(response);
  },

  push: async (
    attemptId: string,
    data: PushTaskAttemptRequest
  ): Promise<Result<void, PushError>> => {
    const response = await makeRequest(`/api/task-attempts/${attemptId}/push`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponseAsResult<void, PushError>(response);
  },

  forcePush: async (
    attemptId: string,
    data: PushTaskAttemptRequest
  ): Promise<Result<void, PushError>> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/push/force`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponseAsResult<void, PushError>(response);
  },

  rebase: async (
    attemptId: string,
    data: RebaseTaskAttemptRequest
  ): Promise<Result<void, GitOperationError>> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/rebase`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponseAsResult<void, GitOperationError>(response);
  },

  change_target_branch: async (
    attemptId: string,
    data: ChangeTargetBranchRequest
  ): Promise<ChangeTargetBranchResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/change-target-branch`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<ChangeTargetBranchResponse>(response);
  },

  renameBranch: async (
    attemptId: string,
    newBranchName: string
  ): Promise<RenameBranchResponse> => {
    const payload: RenameBranchRequest = {
      new_branch_name: newBranchName,
    };
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/rename-branch`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return handleApiResponse<RenameBranchResponse>(response);
  },

  abortConflicts: async (
    attemptId: string,
    data: AbortConflictsRequest
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/conflicts/abort`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<void>(response);
  },

  createPR: async (
    attemptId: string,
    data: CreateGitHubPrRequest
  ): Promise<Result<string, CreatePrError>> => {
    const response = await makeRequest(`/api/task-attempts/${attemptId}/pr`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponseAsResult<string, CreatePrError>(response);
  },

  startDevServer: async (attemptId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/start-dev-server`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<void>(response);
  },

  setupGhCli: async (attemptId: string): Promise<ExecutionProcess> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/gh-cli-setup`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<ExecutionProcess, GhCliSetupError>(response);
  },

  runSetupScript: async (
    attemptId: string
  ): Promise<Result<ExecutionProcess, RunScriptError>> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/run-setup-script`,
      {
        method: 'POST',
      }
    );
    return handleApiResponseAsResult<ExecutionProcess, RunScriptError>(
      response
    );
  },

  runCleanupScript: async (
    attemptId: string
  ): Promise<Result<ExecutionProcess, RunScriptError>> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/run-cleanup-script`,
      {
        method: 'POST',
      }
    );
    return handleApiResponseAsResult<ExecutionProcess, RunScriptError>(
      response
    );
  },

  getPrComments: async (
    attemptId: string,
    repoId: string
  ): Promise<PrCommentsResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/pr/comments?repo_id=${encodeURIComponent(repoId)}`
    );
    return handleApiResponse<PrCommentsResponse>(response);
  },
};

// Execution Process APIs
export const executionProcessesApi = {
  getDetails: async (processId: string): Promise<ExecutionProcess> => {
    const response = await makeRequest(`/api/execution-processes/${processId}`);
    return handleApiResponse<ExecutionProcess>(response);
  },

  getRepoStates: async (
    processId: string
  ): Promise<ExecutionProcessRepoState[]> => {
    const response = await makeRequest(
      `/api/execution-processes/${processId}/repo-states`
    );
    return handleApiResponse<ExecutionProcessRepoState[]>(response);
  },

  stopExecutionProcess: async (processId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/execution-processes/${processId}/stop`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<void>(response);
  },
};

// File System APIs
export const fileSystemApi = {
  list: async (path?: string): Promise<DirectoryListResponse> => {
    const queryParam = path ? `?path=${encodeURIComponent(path)}` : '';
    const response = await makeRequest(
      `/api/filesystem/directory${queryParam}`
    );
    return handleApiResponse<DirectoryListResponse>(response);
  },

  listGitRepos: async (path?: string): Promise<DirectoryEntry[]> => {
    const queryParam = path ? `?path=${encodeURIComponent(path)}` : '';
    const response = await makeRequest(
      `/api/filesystem/git-repos${queryParam}`
    );
    return handleApiResponse<DirectoryEntry[]>(response);
  },
};

// Repo APIs
export const repoApi = {
  register: async (data: {
    path: string;
    display_name?: string;
  }): Promise<Repo> => {
    const response = await makeRequest('/api/repos', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Repo>(response);
  },

  getBranches: async (repoId: string): Promise<GitBranch[]> => {
    const response = await makeRequest(`/api/repos/${repoId}/branches`);
    return handleApiResponse<GitBranch[]>(response);
  },

  init: async (data: {
    parent_path: string;
    folder_name: string;
  }): Promise<Repo> => {
    const response = await makeRequest('/api/repos/init', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Repo>(response);
  },
};

// Config APIs (backwards compatible)
export const configApi = {
  getConfig: async (): Promise<UserSystemInfo> => {
    const response = await makeRequest('/api/info', { cache: 'no-store' });
    return handleApiResponse<UserSystemInfo>(response);
  },
  saveConfig: async (config: Config): Promise<Config> => {
    const response = await makeRequest('/api/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
    return handleApiResponse<Config>(response);
  },
  checkEditorAvailability: async (
    editorType: EditorType
  ): Promise<CheckEditorAvailabilityResponse> => {
    const response = await makeRequest(
      `/api/editors/check-availability?editor_type=${encodeURIComponent(editorType)}`
    );
    return handleApiResponse<CheckEditorAvailabilityResponse>(response);
  },
  checkAgentAvailability: async (
    agent: BaseCodingAgent
  ): Promise<AvailabilityInfo> => {
    const response = await makeRequest(
      `/api/agents/check-availability?executor=${encodeURIComponent(agent)}`
    );
    return handleApiResponse<AvailabilityInfo>(response);
  },
};

// Task Tags APIs (all tags are global)
export const tagsApi = {
  list: async (params?: TagSearchParams): Promise<Tag[]> => {
    const queryParam = params?.search
      ? `?search=${encodeURIComponent(params.search)}`
      : '';
    const response = await makeRequest(`/api/tags${queryParam}`);
    return handleApiResponse<Tag[]>(response);
  },

  create: async (data: CreateTag): Promise<Tag> => {
    const response = await makeRequest('/api/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Tag>(response);
  },

  update: async (tagId: string, data: UpdateTag): Promise<Tag> => {
    const response = await makeRequest(`/api/tags/${tagId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Tag>(response);
  },

  delete: async (tagId: string): Promise<void> => {
    const response = await makeRequest(`/api/tags/${tagId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },
};

// MCP Servers APIs
export const mcpServersApi = {
  load: async (query: McpServerQuery): Promise<GetMcpServerResponse> => {
    const params = new URLSearchParams(query);
    const response = await makeRequest(`/api/mcp-config?${params.toString()}`);
    return handleApiResponse<GetMcpServerResponse>(response);
  },
  save: async (
    query: McpServerQuery,
    data: UpdateMcpServersBody
  ): Promise<void> => {
    const params = new URLSearchParams(query);
    // params.set('profile', profile);
    const response = await makeRequest(`/api/mcp-config?${params.toString()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error('[API Error] Failed to save MCP servers', {
        message: errorData.message,
        status: response.status,
        response,
        timestamp: new Date().toISOString(),
      });
      throw new ApiError(
        errorData.message || 'Failed to save MCP servers',
        response.status,
        response
      );
    }
  },
};

// Profiles API
export const profilesApi = {
  load: async (): Promise<{ content: string; path: string }> => {
    const response = await makeRequest('/api/profiles');
    return handleApiResponse<{ content: string; path: string }>(response);
  },
  save: async (content: string): Promise<string> => {
    const response = await makeRequest('/api/profiles', {
      method: 'PUT',
      body: content,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return handleApiResponse<string>(response);
  },
};

// Images API
export const imagesApi = {
  upload: async (file: File): Promise<ImageResponse> => {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(buildApiUrl('/api/images/upload'), {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(
        `Failed to upload image: ${errorText}`,
        response.status,
        response
      );
    }

    return handleApiResponse<ImageResponse>(response);
  },

  uploadForTask: async (taskId: string, file: File): Promise<ImageResponse> => {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(buildApiUrl(`/api/images/task/${taskId}/upload`), {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(
        `Failed to upload image: ${errorText}`,
        response.status,
        response
      );
    }

    return handleApiResponse<ImageResponse>(response);
  },

  /**
   * Upload an image for a task attempt and immediately copy it to the container.
   * Returns the image with a file_path that can be used in markdown.
   */
  uploadForAttempt: async (
    attemptId: string,
    file: File
  ): Promise<ImageResponse> => {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(
      buildApiUrl(`/api/task-attempts/${attemptId}/images/upload`),
      {
        method: 'POST',
        body: formData,
        credentials: 'include',
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(
        `Failed to upload image: ${errorText}`,
        response.status,
        response
      );
    }

    return handleApiResponse<ImageResponse>(response);
  },

  delete: async (imageId: string): Promise<void> => {
    const response = await makeRequest(`/api/images/${imageId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  getTaskImages: async (taskId: string): Promise<ImageResponse[]> => {
    const response = await makeRequest(`/api/images/task/${taskId}`);
    return handleApiResponse<ImageResponse[]>(response);
  },

  getImageUrl: (imageId: string): string => {
    return `/api/images/${imageId}/file`;
  },
};

// Approval API
export const approvalsApi = {
  respond: async (
    approvalId: string,
    payload: ApprovalResponse,
    signal?: AbortSignal
  ): Promise<ApprovalStatus> => {
    const res = await makeRequest(`/api/approvals/${approvalId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });

    return handleApiResponse<ApprovalStatus>(res);
  },
};

// OAuth API
export const oauthApi = {
  handoffInit: async (
    provider: string,
    returnTo: string
  ): Promise<{ handoff_id: string; authorize_url: string }> => {
    const response = await makeRequest('/api/auth/handoff/init', {
      method: 'POST',
      body: JSON.stringify({ provider, return_to: returnTo }),
    });
    return handleApiResponse<{ handoff_id: string; authorize_url: string }>(
      response
    );
  },

  status: async (): Promise<StatusResponse> => {
    const response = await makeRequest('/api/auth/status', {
      cache: 'no-store',
    });
    return handleApiResponse<StatusResponse>(response);
  },

  logout: async (): Promise<void> => {
    const response = await makeRequest('/api/auth/logout', {
      method: 'POST',
    });
    if (!response.ok) {
      throw new ApiError(
        `Logout failed with status ${response.status}`,
        response.status,
        response
      );
    }
  },

  /** Returns the current access token for the remote server (auto-refreshes if needed) */
  getToken: async (): Promise<TokenResponse | null> => {
    // Don't attempt OAuth token fetch if there's no Clerk auth token
    // This prevents 401 errors when user is not authenticated
    const clerkToken = await getAuthToken();
    if (!clerkToken) {
      return null;
    }
    const response = await makeRequest('/api/auth/token');
    if (!response.ok) return null;
    return handleApiResponse<TokenResponse>(response);
  },

  /** Returns the user ID of the currently authenticated user */
  getCurrentUser: async (): Promise<CurrentUserResponse> => {
    const response = await makeRequest('/api/auth/user');
    return handleApiResponse<CurrentUserResponse>(response);
  },
};

// Organizations API
export const organizationsApi = {
  getMembers: async (
    orgId: string
  ): Promise<OrganizationMemberWithProfile[]> => {
    const response = await makeRequest(`/api/organizations/${orgId}/members`);
    const result = await handleApiResponse<ListMembersResponse>(response);
    return result.members;
  },

  getUserOrganizations: async (): Promise<ListOrganizationsResponse> => {
    const response = await makeRequest('/api/organizations');
    return handleApiResponse<ListOrganizationsResponse>(response);
  },

  getProjects: async (orgId: string): Promise<RemoteProject[]> => {
    const response = await makeRequest(`/api/organizations/${orgId}/projects`);
    return handleApiResponse<RemoteProject[]>(response);
  },

  createOrganization: async (
    data: CreateOrganizationRequest
  ): Promise<CreateOrganizationResponse> => {
    const response = await makeRequest('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleApiResponse<CreateOrganizationResponse>(response);
  },

  createInvitation: async (
    orgId: string,
    data: CreateInvitationRequest
  ): Promise<CreateInvitationResponse> => {
    const response = await makeRequest(
      `/api/organizations/${orgId}/invitations`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<CreateInvitationResponse>(response);
  },

  removeMember: async (orgId: string, userId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/organizations/${orgId}/members/${userId}`,
      {
        method: 'DELETE',
      }
    );
    return handleApiResponse<void>(response);
  },

  updateMemberRole: async (
    orgId: string,
    userId: string,
    data: UpdateMemberRoleRequest
  ): Promise<UpdateMemberRoleResponse> => {
    const response = await makeRequest(
      `/api/organizations/${orgId}/members/${userId}/role`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<UpdateMemberRoleResponse>(response);
  },

  listInvitations: async (orgId: string): Promise<Invitation[]> => {
    const response = await makeRequest(
      `/api/organizations/${orgId}/invitations`
    );
    const result = await handleApiResponse<ListInvitationsResponse>(response);
    return result.invitations;
  },

  revokeInvitation: async (
    orgId: string,
    invitationId: string
  ): Promise<void> => {
    const body: RevokeInvitationRequest = { invitation_id: invitationId };
    const response = await makeRequest(
      `/api/organizations/${orgId}/invitations/revoke`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    return handleApiResponse<void>(response);
  },

  deleteOrganization: async (orgId: string): Promise<void> => {
    const response = await makeRequest(`/api/organizations/${orgId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },
};

// Scratch API
export const scratchApi = {
  create: async (
    scratchType: ScratchType,
    id: string,
    data: CreateScratch
  ): Promise<Scratch> => {
    const response = await makeRequest(`/api/scratch/${scratchType}/${id}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Scratch>(response);
  },

  get: async (scratchType: ScratchType, id: string): Promise<Scratch> => {
    const response = await makeRequest(`/api/scratch/${scratchType}/${id}`);
    return handleApiResponse<Scratch>(response);
  },

  update: async (
    scratchType: ScratchType,
    id: string,
    data: UpdateScratch
  ): Promise<void> => {
    const response = await makeRequest(`/api/scratch/${scratchType}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<void>(response);
  },

  delete: async (scratchType: ScratchType, id: string): Promise<void> => {
    const response = await makeRequest(`/api/scratch/${scratchType}/${id}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  getStreamUrl: (scratchType: ScratchType, id: string): string =>
    `/api/scratch/${scratchType}/${id}/stream/ws`,
};

// Queue API for session follow-up messages
export const queueApi = {
  /**
   * Queue a follow-up message to be executed when current execution finishes
   */
  queue: async (
    sessionId: string,
    data: { message: string; variant: string | null }
  ): Promise<QueueStatus> => {
    const response = await makeRequest(`/api/sessions/${sessionId}/queue`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<QueueStatus>(response);
  },

  /**
   * Cancel a queued follow-up message
   */
  cancel: async (sessionId: string): Promise<QueueStatus> => {
    const response = await makeRequest(`/api/sessions/${sessionId}/queue`, {
      method: 'DELETE',
    });
    return handleApiResponse<QueueStatus>(response);
  },

  /**
   * Get the current queue status for a session
   */
  getStatus: async (sessionId: string): Promise<QueueStatus> => {
    const response = await makeRequest(`/api/sessions/${sessionId}/queue`);
    return handleApiResponse<QueueStatus>(response);
  },
};

// Teams API
export const teamsApi = {
  list: async (workspaceId?: string): Promise<Team[]> => {
    const params = new URLSearchParams();
    if (workspaceId) params.set('workspace_id', workspaceId);
    const url = `/api/teams${params.toString() ? `?${params}` : ''}`;
    const response = await makeRequest(url);
    return handleApiResponse<Team[]>(response);
  },

  get: async (teamId: string): Promise<Team> => {
    const response = await makeRequest(`/api/teams/${teamId}`);
    return handleApiResponse<Team>(response);
  },

  create: async (data: CreateTeam): Promise<Team> => {
    const response = await makeRequest('/api/teams', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Team>(response);
  },

  update: async (teamId: string, data: UpdateTeam): Promise<Team> => {
    const response = await makeRequest(`/api/teams/${teamId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Team>(response);
  },

  delete: async (teamId: string): Promise<void> => {
    const response = await makeRequest(`/api/teams/${teamId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  getProjects: async (teamId: string): Promise<string[]> => {
    const response = await makeRequest(`/api/teams/${teamId}/projects`);
    return handleApiResponse<string[]>(response);
  },

  assignProject: async (
    teamId: string,
    data: TeamProjectAssignment
  ): Promise<TeamProject> => {
    const response = await makeRequest(`/api/teams/${teamId}/projects`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TeamProject>(response);
  },

  removeProject: async (teamId: string, projectId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/teams/${teamId}/projects/${projectId}`,
      {
        method: 'DELETE',
      }
    );
    return handleApiResponse<void>(response);
  },

  getIssues: async (teamId: string): Promise<TaskWithAttemptStatus[]> => {
    const response = await makeRequest(`/api/teams/${teamId}/issues`);
    return handleApiResponse<TaskWithAttemptStatus[]>(response);
  },

  migrateTasks: async (
    teamId: string,
    data: MigrateTasksRequest
  ): Promise<MigrateTasksResponse> => {
    const response = await makeRequest(`/api/teams/${teamId}/migrate-tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<MigrateTasksResponse>(response);
  },

  validateStoragePath: async (
    data: ValidateStoragePathRequest
  ): Promise<ValidateStoragePathResponse> => {
    const response = await makeRequest('/api/teams/validate-storage-path', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<ValidateStoragePathResponse>(response);
  },

  // Workspace-level GitHub connection methods
  getWorkspaceGitHubConnection: async (): Promise<GitHubConnectionWithRepos | null> => {
    const response = await makeRequest('/api/settings/github');
    return handleApiResponse<GitHubConnectionWithRepos | null>(response);
  },

  createWorkspaceGitHubConnection: async (
    data: CreateGitHubConnection
  ): Promise<GitHubConnection> => {
    const response = await makeRequest('/api/settings/github', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<GitHubConnection>(response);
  },

  updateWorkspaceGitHubConnection: async (
    data: UpdateGitHubConnection
  ): Promise<GitHubConnection> => {
    const response = await makeRequest('/api/settings/github', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<GitHubConnection>(response);
  },

  deleteWorkspaceGitHubConnection: async (): Promise<void> => {
    const response = await makeRequest('/api/settings/github', {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  getWorkspaceGitHubRepositories: async (): Promise<GitHubRepository[]> => {
    const response = await makeRequest('/api/settings/github/repos');
    return handleApiResponse<GitHubRepository[]>(response);
  },

  getWorkspaceAvailableGitHubRepos: async (): Promise<GitHubRepoInfo[]> => {
    const response = await makeRequest('/api/settings/github/repos/available');
    return handleApiResponse<GitHubRepoInfo[]>(response);
  },

  linkWorkspaceGitHubRepository: async (
    data: LinkGitHubRepository
  ): Promise<GitHubRepository> => {
    const response = await makeRequest('/api/settings/github/repos', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<GitHubRepository>(response);
  },

  unlinkWorkspaceGitHubRepository: async (repoId: string): Promise<void> => {
    const response = await makeRequest(`/api/settings/github/repos/${repoId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  // Team-level GitHub connection methods (deprecated - use workspace level)
  getGitHubConnection: async (
    teamId: string
  ): Promise<GitHubConnectionWithRepos | null> => {
    const response = await makeRequest(`/api/teams/${teamId}/github`);
    return handleApiResponse<GitHubConnectionWithRepos | null>(response);
  },

  createGitHubConnection: async (
    teamId: string,
    data: CreateGitHubConnection
  ): Promise<GitHubConnection> => {
    const response = await makeRequest(`/api/teams/${teamId}/github`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<GitHubConnection>(response);
  },

  updateGitHubConnection: async (
    teamId: string,
    data: UpdateGitHubConnection
  ): Promise<GitHubConnection> => {
    const response = await makeRequest(`/api/teams/${teamId}/github`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<GitHubConnection>(response);
  },

  deleteGitHubConnection: async (teamId: string): Promise<void> => {
    const response = await makeRequest(`/api/teams/${teamId}/github`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  getGitHubRepositories: async (teamId: string): Promise<GitHubRepository[]> => {
    const response = await makeRequest(`/api/teams/${teamId}/github/repos`);
    return handleApiResponse<GitHubRepository[]>(response);
  },

  linkGitHubRepository: async (
    teamId: string,
    data: LinkGitHubRepository
  ): Promise<GitHubRepository> => {
    const response = await makeRequest(`/api/teams/${teamId}/github/repos`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<GitHubRepository>(response);
  },

  unlinkGitHubRepository: async (
    teamId: string,
    repoId: string
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/teams/${teamId}/github/repos/${repoId}`,
      {
        method: 'DELETE',
      }
    );
    return handleApiResponse<void>(response);
  },

  // GitHub OAuth
  getGitHubAuthorizeUrl: async (
    teamId: string
  ): Promise<GitHubAuthorizeResponse> => {
    const response = await makeRequest(
      `/api/oauth/github/authorize?team_id=${teamId}`
    );
    return handleApiResponse<GitHubAuthorizeResponse>(response);
  },

  // GitHub Sync
  getAvailableGitHubRepos: async (
    teamId: string
  ): Promise<GitHubRepoInfo[]> => {
    const response = await makeRequest(
      `/api/teams/${teamId}/github/repos/available`
    );
    return handleApiResponse<GitHubRepoInfo[]>(response);
  },

  configureRepoSync: async (
    teamId: string,
    repoId: string,
    data: ConfigureSyncRequest
  ): Promise<GitHubRepository> => {
    const response = await makeRequest(
      `/api/teams/${teamId}/github/repos/${repoId}/sync`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<GitHubRepository>(response);
  },

  clearRepoSync: async (
    teamId: string,
    repoId: string
  ): Promise<GitHubRepository> => {
    const response = await makeRequest(
      `/api/teams/${teamId}/github/repos/${repoId}/sync`,
      {
        method: 'DELETE',
      }
    );
    return handleApiResponse<GitHubRepository>(response);
  },

  pushDocumentsToGitHub: async (
    teamId: string,
    repoId: string,
    data?: PushDocumentsRequest
  ): Promise<SyncOperationResponse> => {
    const response = await makeRequest(
      `/api/teams/${teamId}/github/repos/${repoId}/push`,
      {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }
    );
    return handleApiResponse<SyncOperationResponse>(response);
  },

  pullDocumentsFromGitHub: async (
    teamId: string,
    repoId: string
  ): Promise<SyncOperationResponse> => {
    const response = await makeRequest(
      `/api/teams/${teamId}/github/repos/${repoId}/pull`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<SyncOperationResponse>(response);
  },

  // Multi-folder sync config endpoints
  getSyncConfigs: async (
    teamId: string,
    repoId: string
  ): Promise<GitHubRepoSyncConfig[]> => {
    const response = await makeRequest(
      `/api/teams/${teamId}/github/repos/${repoId}/sync-configs`
    );
    return handleApiResponse<GitHubRepoSyncConfig[]>(response);
  },

  configureMultiFolderSync: async (
    teamId: string,
    repoId: string,
    data: ConfigureMultiFolderSync
  ): Promise<GitHubRepoSyncConfig[]> => {
    const response = await makeRequest(
      `/api/teams/${teamId}/github/repos/${repoId}/sync-configs`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<GitHubRepoSyncConfig[]>(response);
  },

  clearMultiFolderSync: async (teamId: string, repoId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/teams/${teamId}/github/repos/${repoId}/sync-configs`,
      {
        method: 'DELETE',
      }
    );
    return handleApiResponse<void>(response);
  },

  // Team Members API
  getMembers: async (teamId: string): Promise<TeamMember[]> => {
    const response = await makeRequest(`/api/teams/${teamId}/members`);
    return handleApiResponse<TeamMember[]>(response);
  },

  addMember: async (teamId: string, data: CreateTeamMember): Promise<TeamMember> => {
    const response = await makeRequest(`/api/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TeamMember>(response);
  },

  updateMemberRole: async (
    teamId: string,
    memberId: string,
    data: UpdateTeamMemberRole
  ): Promise<TeamMember> => {
    const response = await makeRequest(`/api/teams/${teamId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TeamMember>(response);
  },

  removeMember: async (teamId: string, memberId: string): Promise<void> => {
    const response = await makeRequest(`/api/teams/${teamId}/members/${memberId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  syncClerkMember: async (teamId: string, data: SyncClerkMember): Promise<TeamMember> => {
    const response = await makeRequest(`/api/teams/${teamId}/members/sync`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TeamMember>(response);
  },

  // Member Project Access API
  getMemberProjects: async (teamId: string, memberId: string): Promise<string[]> => {
    const response = await makeRequest(`/api/teams/${teamId}/members/${memberId}/projects`);
    return handleApiResponse<string[]>(response);
  },

  setMemberProjects: async (
    teamId: string,
    memberId: string,
    projectIds: string[]
  ): Promise<string[]> => {
    const response = await makeRequest(
      `/api/teams/${teamId}/members/${memberId}/projects`,
      {
        method: 'PUT',
        body: JSON.stringify({ project_ids: projectIds }),
      }
    );
    return handleApiResponse<string[]>(response);
  },

  // Team Invitations API
  getInvitations: async (teamId: string): Promise<TeamInvitation[]> => {
    const response = await makeRequest(`/api/teams/${teamId}/invitations`);
    return handleApiResponse<TeamInvitation[]>(response);
  },

  createInvitation: async (
    teamId: string,
    data: CreateTeamInvitation
  ): Promise<TeamInvitation> => {
    const response = await makeRequest(`/api/teams/${teamId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TeamInvitation>(response);
  },

  cancelInvitation: async (teamId: string, invitationId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/teams/${teamId}/invitations/${invitationId}`,
      {
        method: 'DELETE',
      }
    );
    return handleApiResponse<void>(response);
  },

  updateInvitationRole: async (
    teamId: string,
    invitationId: string,
    data: UpdateTeamInvitation
  ): Promise<TeamInvitation> => {
    const response = await makeRequest(
      `/api/teams/${teamId}/invitations/${invitationId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<TeamInvitation>(response);
  },
};

// User Invitations API (for users to manage their own invitations)
export const userInvitationsApi = {
  getMyInvitations: async (): Promise<TeamInvitationWithTeam[]> => {
    const response = await makeRequest('/api/team-invitations');
    return handleApiResponse<TeamInvitationWithTeam[]>(response);
  },

  acceptInvitation: async (invitationId: string): Promise<TeamMember> => {
    const response = await makeRequest(`/api/team-invitations/${invitationId}/accept`, {
      method: 'POST',
    });
    return handleApiResponse<TeamMember>(response);
  },

  declineInvitation: async (invitationId: string): Promise<void> => {
    const response = await makeRequest(`/api/team-invitations/${invitationId}/decline`, {
      method: 'POST',
    });
    return handleApiResponse<void>(response);
  },

  // Token-based invitation methods (for shareable links)
  getInvitationByToken: async (token: string): Promise<InvitationByTokenResponse> => {
    const response = await makeRequest(`/api/team-invitations/by-token/${token}`);
    return handleApiResponse<InvitationByTokenResponse>(response);
  },

  acceptInvitationByToken: async (token: string): Promise<TeamMember> => {
    const response = await makeRequest(`/api/team-invitations/by-token/${token}/accept`, {
      method: 'POST',
    });
    return handleApiResponse<TeamMember>(response);
  },

  declineInvitationByToken: async (token: string): Promise<void> => {
    const response = await makeRequest(`/api/team-invitations/by-token/${token}/decline`, {
      method: 'POST',
    });
    return handleApiResponse<void>(response);
  },
};

// Inbox API
export const inboxApi = {
  list: async (limit?: number): Promise<InboxItem[]> => {
    const queryParam = limit ? `?limit=${limit}` : '';
    const response = await makeRequest(`/api/inbox${queryParam}`);
    return handleApiResponse<InboxItem[]>(response);
  },

  listUnread: async (limit?: number): Promise<InboxItem[]> => {
    const queryParam = limit ? `?limit=${limit}` : '';
    const response = await makeRequest(`/api/inbox/unread${queryParam}`);
    return handleApiResponse<InboxItem[]>(response);
  },

  getSummary: async (): Promise<InboxSummary> => {
    const response = await makeRequest('/api/inbox/summary');
    return handleApiResponse<InboxSummary>(response);
  },

  get: async (itemId: string): Promise<InboxItem> => {
    const response = await makeRequest(`/api/inbox/${itemId}`);
    return handleApiResponse<InboxItem>(response);
  },

  create: async (data: CreateInboxItem): Promise<InboxItem> => {
    const response = await makeRequest('/api/inbox', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<InboxItem>(response);
  },

  markAsRead: async (itemId: string): Promise<InboxItem> => {
    const response = await makeRequest(`/api/inbox/${itemId}/read`, {
      method: 'POST',
    });
    return handleApiResponse<InboxItem>(response);
  },

  markAllAsRead: async (): Promise<number> => {
    const response = await makeRequest('/api/inbox/read-all', {
      method: 'POST',
    });
    return handleApiResponse<number>(response);
  },

  delete: async (itemId: string): Promise<void> => {
    const response = await makeRequest(`/api/inbox/${itemId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },
};

// Documents API
export const documentsApi = {
  // Document folders
  listFolders: async (teamId: string): Promise<DocumentFolder[]> => {
    const response = await makeRequest(`/api/teams/${teamId}/folders`);
    return handleApiResponse<DocumentFolder[]>(response);
  },

  getFolder: async (teamId: string, folderId: string): Promise<DocumentFolder> => {
    const response = await makeRequest(`/api/teams/${teamId}/folders/${folderId}`);
    return handleApiResponse<DocumentFolder>(response);
  },

  createFolder: async (teamId: string, data: CreateDocumentFolder): Promise<DocumentFolder> => {
    const response = await makeRequest(`/api/teams/${teamId}/folders`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<DocumentFolder>(response);
  },

  updateFolder: async (
    teamId: string,
    folderId: string,
    data: UpdateDocumentFolder
  ): Promise<DocumentFolder> => {
    const response = await makeRequest(`/api/teams/${teamId}/folders/${folderId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<DocumentFolder>(response);
  },

  deleteFolder: async (teamId: string, folderId: string): Promise<void> => {
    const response = await makeRequest(`/api/teams/${teamId}/folders/${folderId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  // Documents
  list: async (
    teamId: string,
    options?: { folderId?: string; includeArchived?: boolean; search?: string; all?: boolean }
  ): Promise<Document[]> => {
    const params = new URLSearchParams();
    if (options?.folderId) params.append('folder_id', options.folderId);
    if (options?.includeArchived) params.append('include_archived', 'true');
    if (options?.search) params.append('search', options.search);
    if (options?.all) params.append('all', 'true');
    const queryString = params.toString();
    const url = `/api/teams/${teamId}/documents${queryString ? `?${queryString}` : ''}`;
    const response = await makeRequest(url);
    return handleApiResponse<Document[]>(response);
  },

  get: async (teamId: string, documentId: string): Promise<Document> => {
    const response = await makeRequest(`/api/teams/${teamId}/documents/${documentId}`);
    return handleApiResponse<Document>(response);
  },

  getBySlug: async (teamId: string, slug: string): Promise<Document> => {
    const response = await makeRequest(`/api/teams/${teamId}/documents/by-slug/${slug}`);
    return handleApiResponse<Document>(response);
  },

  create: async (teamId: string, data: CreateDocument): Promise<Document> => {
    const response = await makeRequest(`/api/teams/${teamId}/documents`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Document>(response);
  },

  update: async (
    teamId: string,
    documentId: string,
    data: UpdateDocument
  ): Promise<Document> => {
    const response = await makeRequest(`/api/teams/${teamId}/documents/${documentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Document>(response);
  },

  delete: async (teamId: string, documentId: string): Promise<void> => {
    const response = await makeRequest(`/api/teams/${teamId}/documents/${documentId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  // Scan filesystem for new documents
  scanFilesystem: async (
    teamId: string,
    folderId: string
  ): Promise<ScanFilesystemResponse> => {
    const response = await makeRequest(`/api/teams/${teamId}/folders/${folderId}/scan`, {
      method: 'POST',
    });
    return handleApiResponse<ScanFilesystemResponse>(response);
  },

  // Discover folders from filesystem and create them in database
  discoverFolders: async (teamId: string): Promise<DiscoverFoldersResponse> => {
    const response = await makeRequest(`/api/teams/${teamId}/documents/discover-folders`, {
      method: 'POST',
    });
    return handleApiResponse<DiscoverFoldersResponse>(response);
  },

  // Recursive scan: create all nested folders and documents from filesystem
  scanAll: async (teamId: string): Promise<ScanAllResponse> => {
    const response = await makeRequest(`/api/teams/${teamId}/documents/scan-all`, {
      method: 'POST',
    });
    return handleApiResponse<ScanAllResponse>(response);
  },

  // Get document content with type-specific handling
  getContent: async (
    teamId: string,
    documentId: string
  ): Promise<DocumentContentResponse> => {
    const response = await makeRequest(`/api/teams/${teamId}/documents/${documentId}/content`);
    return handleApiResponse<DocumentContentResponse>(response);
  },

  // Get document file URL for direct file access (PDF viewer, images, etc.)
  getFileUrl: (teamId: string, documentId: string): string => {
    return `/api/teams/${teamId}/documents/${documentId}/file`;
  },

  // Upload documents via browser file picker
  upload: async (teamId: string, formData: FormData): Promise<UploadResult> => {
    // Use fetch directly since FormData needs special handling (no Content-Type header)
    const headers: HeadersInit = {};
    const token = await getAuthToken();
    if (token) {
      headers['Authorization'] = `${token}`;
    } else {
      console.warn('No auth token available for upload - user may need to sign in again');
    }

    const response = await fetch(`${API_BASE_URL}/api/teams/${teamId}/documents/upload`, {
      method: 'POST',
      headers,
      body: formData,
      // Note: Don't set Content-Type header - browser sets it with boundary for multipart
    });
    return handleApiResponse<UploadResult>(response);
  },

  getUploadUrl: async (
    teamId: string,
    filename: string,
    folderId: string | null
  ): Promise<SignedUrlResponse> => {
    const response = await makeRequest(`/api/teams/${teamId}/documents/upload-url`, {
      method: 'POST',
      body: JSON.stringify({ filename, folder_id: folderId }),
    });
    return handleApiResponse<SignedUrlResponse>(response);
  },
};

// API Keys API
export const apiKeysApi = {
  list: async (): Promise<ApiKeyInfo[]> => {
    const response = await makeRequest('/api/api-keys');
    return handleApiResponse<ApiKeyInfo[]>(response);
  },

  create: async (data: CreateApiKeyRequest): Promise<ApiKeyWithSecret> => {
    const response = await makeRequest('/api/api-keys', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<ApiKeyWithSecret>(response);
  },

  revoke: async (keyId: string): Promise<void> => {
    const response = await makeRequest(`/api/api-keys/${keyId}/revoke`, {
      method: 'POST',
    });
    return handleApiResponse<void>(response);
  },

  delete: async (keyId: string): Promise<void> => {
    const response = await makeRequest(`/api/api-keys/${keyId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },
};

// Tenant Workspaces API
export const tenantWorkspacesApi = {
  // List workspaces the user belongs to
  list: async (userId: string): Promise<TenantWorkspace[]> => {
    const response = await makeRequest(`/api/tenant-workspaces?user_id=${encodeURIComponent(userId)}`);
    return handleApiResponse<TenantWorkspace[]>(response);
  },

  // Ensure user is in default workspace (for first login or missing membership)
  ensureDefault: async (userId: string, email: string): Promise<TenantWorkspace[]> => {
    const response = await makeRequest(
      `/api/tenant-workspaces/ensure-default?user_id=${encodeURIComponent(userId)}&email=${encodeURIComponent(email)}`,
      { method: 'POST' }
    );
    return handleApiResponse<TenantWorkspace[]>(response);
  },

  // Get a single workspace
  get: async (workspaceId: string, userId: string): Promise<TenantWorkspace> => {
    const response = await makeRequest(`/api/tenant-workspaces/${workspaceId}?user_id=${encodeURIComponent(userId)}`);
    return handleApiResponse<TenantWorkspace>(response);
  },

  // Get workspace by slug
  getBySlug: async (slug: string, userId: string): Promise<TenantWorkspace> => {
    const response = await makeRequest(`/api/tenant-workspaces/by-slug/${slug}?user_id=${encodeURIComponent(userId)}`);
    return handleApiResponse<TenantWorkspace>(response);
  },

  // Create a new workspace
  create: async (data: CreateTenantWorkspace, userId: string, email: string): Promise<TenantWorkspace> => {
    const response = await makeRequest(`/api/tenant-workspaces?user_id=${encodeURIComponent(userId)}&email=${encodeURIComponent(email)}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TenantWorkspace>(response);
  },

  // Update a workspace
  update: async (workspaceId: string, data: UpdateTenantWorkspace, userId: string): Promise<TenantWorkspace> => {
    const response = await makeRequest(`/api/tenant-workspaces/${workspaceId}?user_id=${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TenantWorkspace>(response);
  },

  // Delete a workspace
  delete: async (workspaceId: string, userId: string): Promise<void> => {
    const response = await makeRequest(`/api/tenant-workspaces/${workspaceId}?user_id=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  // Get workspace members
  getMembers: async (workspaceId: string, userId: string): Promise<TenantWorkspaceMember[]> => {
    const response = await makeRequest(`/api/tenant-workspaces/${workspaceId}/members?user_id=${encodeURIComponent(userId)}`);
    return handleApiResponse<TenantWorkspaceMember[]>(response);
  },

  // Add a member to workspace
  addMember: async (workspaceId: string, data: AddWorkspaceMember, callerUserId: string): Promise<TenantWorkspaceMember> => {
    const response = await makeRequest(`/api/tenant-workspaces/${workspaceId}/members?user_id=${encodeURIComponent(callerUserId)}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TenantWorkspaceMember>(response);
  },

  // Update member role
  updateMemberRole: async (
    workspaceId: string,
    targetUserId: string,
    data: UpdateWorkspaceMemberRole,
    callerUserId: string
  ): Promise<TenantWorkspaceMember> => {
    const response = await makeRequest(`/api/tenant-workspaces/${workspaceId}/members/${targetUserId}?user_id=${encodeURIComponent(callerUserId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TenantWorkspaceMember>(response);
  },

  // Remove a member
  removeMember: async (workspaceId: string, targetUserId: string, callerUserId: string): Promise<void> => {
    const response = await makeRequest(`/api/tenant-workspaces/${workspaceId}/members/${targetUserId}?user_id=${encodeURIComponent(callerUserId)}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },
};

// User Registrations API (for onboarding flow)
export const registrationsApi = {
  // Get current user's registration status
  getMyRegistration: async (): Promise<UserRegistration | null> => {
    const response = await makeRequest('/api/registrations/me');
    return handleApiResponse<UserRegistration | null>(response);
  },

  // Create a new user registration
  create: async (data: CreateUserRegistration): Promise<UserRegistration> => {
    const response = await makeRequest('/api/registrations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<UserRegistration>(response);
  },

  // List all pending registrations (admin only)
  listPending: async (): Promise<UserRegistration[]> => {
    const response = await makeRequest('/api/registrations');
    return handleApiResponse<UserRegistration[]>(response);
  },

  // List registrations with optional status filter
  list: async (status?: string): Promise<UserRegistration[]> => {
    const queryParam = status ? `?status=${status}` : '';
    const response = await makeRequest(`/api/registrations${queryParam}`);
    return handleApiResponse<UserRegistration[]>(response);
  },

  // Approve a registration (admin only)
  approve: async (registrationId: string): Promise<UserRegistration> => {
    const response = await makeRequest(`/api/registrations/${registrationId}/approve`, {
      method: 'POST',
    });
    return handleApiResponse<UserRegistration>(response);
  },

  // Reject a registration (admin only)
  reject: async (registrationId: string, reason?: string): Promise<UserRegistration> => {
    const response = await makeRequest(`/api/registrations/${registrationId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return handleApiResponse<UserRegistration>(response);
  },
};
