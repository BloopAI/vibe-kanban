/**
 * Task Attempts API namespace - CRUD and operations for task attempts.
 */

import type {
  TaskAttempt,
  TaskRelationships,
  CreateTaskAttemptBody,
  CreateFollowUpAttempt,
  CreateReviewAttempt,
  RunAgentSetupRequest,
  RunAgentSetupResponse,
  DraftResponse,
  UpdateFollowUpDraftRequest,
  UpdateRetryFollowUpDraftRequest,
  OpenEditorRequest,
  OpenEditorResponse,
  BranchStatus,
  RebaseTaskAttemptRequest,
  ChangeTargetBranchRequest,
  ChangeTargetBranchResponse,
  RenameBranchRequest,
  RenameBranchResponse,
  CreateGitHubPrRequest,
  ExecutionProcess,
  GhCliSetupError,
  WorktreePathResponse,
  DirtyFilesResponse,
  StashChangesRequest,
  StashChangesResponse,
  PurgeResult,
  FixSessionsResponse,
  GitOperationError,
  PushError,
  CreatePrError,
} from 'shared/types';
import {
  makeRequest,
  handleApiResponse,
  handleApiResponseAsResult,
  type Result,
} from './utils';

// Task Attempts APIs
export const attemptsApi = {
  getChildren: async (attemptId: string): Promise<TaskRelationships> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/children`
    );
    return handleApiResponse<TaskRelationships>(response);
  },

  getAll: async (taskId: string): Promise<TaskAttempt[]> => {
    const response = await makeRequest(`/api/task-attempts?task_id=${taskId}`);
    return handleApiResponse<TaskAttempt[]>(response);
  },

  get: async (attemptId: string): Promise<TaskAttempt> => {
    const response = await makeRequest(`/api/task-attempts/${attemptId}`);
    return handleApiResponse<TaskAttempt>(response);
  },

  create: async (data: CreateTaskAttemptBody): Promise<TaskAttempt> => {
    const response = await makeRequest(`/api/task-attempts`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TaskAttempt>(response);
  },

  stop: async (attemptId: string): Promise<void> => {
    const response = await makeRequest(`/api/task-attempts/${attemptId}/stop`, {
      method: 'POST',
    });
    return handleApiResponse<void>(response);
  },

  followUp: async (
    attemptId: string,
    data: CreateFollowUpAttempt
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/follow-up`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<void>(response);
  },

  review: async (
    attemptId: string,
    data: CreateReviewAttempt
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/review`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
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

  getDraft: async (
    attemptId: string,
    type: 'follow_up' | 'retry'
  ): Promise<DraftResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/draft?type=${encodeURIComponent(type)}`
    );
    return handleApiResponse<DraftResponse>(response);
  },

  saveDraft: async (
    attemptId: string,
    type: 'follow_up' | 'retry',
    data: UpdateFollowUpDraftRequest | UpdateRetryFollowUpDraftRequest
  ): Promise<DraftResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/draft?type=${encodeURIComponent(type)}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<DraftResponse>(response);
  },

  deleteDraft: async (
    attemptId: string,
    type: 'follow_up' | 'retry'
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/draft?type=${encodeURIComponent(type)}`,
      { method: 'DELETE' }
    );
    return handleApiResponse<void>(response);
  },

  setDraftQueue: async (
    attemptId: string,
    queued: boolean,
    expectedQueued?: boolean,
    expectedVersion?: number,
    type: 'follow_up' | 'retry' = 'follow_up'
  ): Promise<DraftResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/draft/queue?type=${encodeURIComponent(type)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          queued,
          expected_queued: expectedQueued,
          expected_version: expectedVersion,
        }),
      }
    );
    return handleApiResponse<DraftResponse>(response);
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

  getBranchStatus: async (attemptId: string): Promise<BranchStatus> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/branch-status`
    );
    return handleApiResponse<BranchStatus>(response);
  },

  merge: async (attemptId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/merge`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<void>(response);
  },

  push: async (attemptId: string): Promise<Result<void, PushError>> => {
    const response = await makeRequest(`/api/task-attempts/${attemptId}/push`, {
      method: 'POST',
    });
    return handleApiResponseAsResult<void, PushError>(response);
  },

  forcePush: async (attemptId: string): Promise<Result<void, PushError>> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/push/force`,
      {
        method: 'POST',
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

  abortConflicts: async (attemptId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/conflicts/abort`,
      {
        method: 'POST',
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

  getWorktreePath: async (attemptId: string): Promise<WorktreePathResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/worktree-path`
    );
    return handleApiResponse<WorktreePathResponse>(response);
  },

  // Stash operations
  getDirtyFiles: async (attemptId: string): Promise<DirtyFilesResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/stash/dirty-files`
    );
    return handleApiResponse<DirtyFilesResponse>(response);
  },

  stashChanges: async (
    attemptId: string,
    message?: string
  ): Promise<StashChangesResponse> => {
    const payload: StashChangesRequest = { message: message ?? null };
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/stash`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return handleApiResponse<StashChangesResponse>(response);
  },

  popStash: async (attemptId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/stash/pop`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<void>(response);
  },

  /** Clean up a task attempt's worktree (deletes filesystem and marks as deleted in DB). */
  cleanup: async (attemptId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/cleanup`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<void>(response);
  },

  /** Purge build artifacts from worktree without deleting it. */
  purge: async (attemptId: string): Promise<PurgeResult> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/purge`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<PurgeResult>(response);
  },

  /** Check if the latest failed execution has a session invalid error. */
  hasSessionError: async (attemptId: string): Promise<boolean> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/has-session-error`
    );
    return handleApiResponse<boolean>(response);
  },

  /** Fix corrupted sessions by invalidating sessions from failed/killed execution processes. */
  fixSessions: async (attemptId: string): Promise<FixSessionsResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/fix-sessions`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<FixSessionsResponse>(response);
  },
};
