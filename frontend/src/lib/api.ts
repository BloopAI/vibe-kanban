// Import all necessary types from shared types
import {
  BranchStatus,
  Config,
  CreateFollowUpAttempt,
  CreateProject,
  CreateTask,
  CreateTaskAndStart,
  CreateTaskAttempt,
  CreateTaskTemplate,
  DeviceStartResponse,
  DirectoryEntry,
  type EditorType,
  ExecutionProcess,
  ExecutionProcessSummary,
  GitBranch,
  ProcessLogsResponse,
  Project,
  ProjectWithBranch,
  Task,
  TaskAttempt,
  TaskAttemptState,
  TaskTemplate,
  TaskWithAttemptStatus,
  UpdateProject,
  UpdateTask,
  UpdateTaskTemplate,
  WorktreeDiff,
} from 'shared/types';

export const makeRequest = async (url: string, options: RequestInit = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  return fetch(url, {
    ...options,
    headers,
  });
};

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface FollowUpResponse {
  message: string;
  actual_attempt_id: string;
  created_new_attempt: boolean;
}

// Additional interface for file search results
export interface FileSearchResult {
  path: string;
  name: string;
}

// Directory listing response
export interface DirectoryListResponse {
  entries: DirectoryEntry[];
  current_path: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: Response
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const handleApiResponse = async <T>(response: Response): Promise<T> => {
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
    throw new ApiError(errorMessage, response.status, response);
  }

  const result: ApiResponse<T> = await response.json();

  if (!result.success) {
    console.error('[API Error]', {
      message: result.message || 'API request failed',
      status: response.status,
      response,
      endpoint: response.url,
      timestamp: new Date().toISOString(),
    });
    throw new ApiError(result.message || 'API request failed');
  }

  return result.data as T;
};

// Project Management APIs
export const projectsApi = {
  getAll: async (): Promise<Project[]> => {
    const response = await makeRequest('/api/projects');
    return handleApiResponse<Project[]>(response);
  },

  getById: async (id: string): Promise<Project> => {
    const response = await makeRequest(`/api/projects/${id}`);
    return handleApiResponse<Project>(response);
  },

  getWithBranch: async (id: string): Promise<ProjectWithBranch> => {
    const response = await makeRequest(`/api/projects/${id}/with-branch`);
    return handleApiResponse<ProjectWithBranch>(response);
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

  delete: async (id: string): Promise<void> => {
    const response = await makeRequest(`/api/projects/${id}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  openEditor: async (id: string): Promise<void> => {
    const response = await makeRequest(`/api/projects/${id}/open-editor`, {
      method: 'POST',
      body: JSON.stringify(null),
    });
    return handleApiResponse<void>(response);
  },

  getBranches: async (id: string): Promise<GitBranch[]> => {
    const response = await makeRequest(`/api/projects/${id}/branches`);
    return handleApiResponse<GitBranch[]>(response);
  },

  searchFiles: async (
    id: string,
    query: string
  ): Promise<FileSearchResult[]> => {
    const response = await makeRequest(
      `/api/projects/${id}/search?q=${encodeURIComponent(query)}`
    );
    return handleApiResponse<FileSearchResult[]>(response);
  },
};

// Task Management APIs
export const tasksApi = {
  getAll: async (projectId: string): Promise<TaskWithAttemptStatus[]> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks`);
    return handleApiResponse<TaskWithAttemptStatus[]>(response);
  },

  getById: async (projectId: string, taskId: string): Promise<Task> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}`
    );
    return handleApiResponse<Task>(response);
  },

  create: async (projectId: string, data: CreateTask): Promise<Task> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Task>(response);
  },

  createAndStart: async (
    projectId: string,
    data: CreateTaskAndStart
  ): Promise<TaskWithAttemptStatus> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/create-and-start`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<TaskWithAttemptStatus>(response);
  },

  update: async (
    projectId: string,
    taskId: string,
    data: UpdateTask
  ): Promise<Task> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<Task>(response);
  },

  delete: async (projectId: string, taskId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}`,
      {
        method: 'DELETE',
      }
    );
    return handleApiResponse<void>(response);
  },

  getChildren: async (
    projectId: string,
    taskId: string,
    attemptId: string
  ): Promise<Task[]> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/children`
    );
    return handleApiResponse<Task[]>(response);
  },
};

// Task Attempts APIs
export const attemptsApi = {
  getAll: async (projectId: string, taskId: string): Promise<TaskAttempt[]> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts`
    );
    return handleApiResponse<TaskAttempt[]>(response);
  },

  create: async (
    projectId: string,
    taskId: string,
    data: CreateTaskAttempt
  ): Promise<TaskAttempt> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<TaskAttempt>(response);
  },

  getState: async (
    projectId: string,
    taskId: string,
    attemptId: string
  ): Promise<TaskAttemptState> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}`
    );
    return handleApiResponse<TaskAttemptState>(response);
  },

  stop: async (
    projectId: string,
    taskId: string,
    attemptId: string
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/stop`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<void>(response);
  },

  followUp: async (
    projectId: string,
    taskId: string,
    attemptId: string,
    data: CreateFollowUpAttempt
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/follow-up`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<void>(response);
  },

  getDiff: async (
    projectId: string,
    taskId: string,
    attemptId: string
  ): Promise<WorktreeDiff> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/diff`
    );
    return handleApiResponse<WorktreeDiff>(response);
  },

  deleteFile: async (
    projectId: string,
    taskId: string,
    attemptId: string,
    fileToDelete: string
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/delete-filefile_path=${encodeURIComponent(
        fileToDelete
      )}`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<void>(response);
  },

  openEditor: async (
    projectId: string,
    taskId: string,
    attemptId: string,
    editorType?: EditorType
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/open-editor`,
      {
        method: 'POST',
        body: JSON.stringify(editorType ? { editor_type: editorType } : null),
      }
    );
    return handleApiResponse<void>(response);
  },

  getBranchStatus: async (
    projectId: string,
    taskId: string,
    attemptId: string
  ): Promise<BranchStatus> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/branch-status`
    );
    return handleApiResponse<BranchStatus>(response);
  },

  merge: async (
    projectId: string,
    taskId: string,
    attemptId: string
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/merge`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<void>(response);
  },

  rebase: async (
    projectId: string,
    taskId: string,
    attemptId: string,
    newBaseBranch?: string
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/rebase`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          new_base_branch: newBaseBranch || null,
        }),
      }
    );
    return handleApiResponse<void>(response);
  },

  createPR: async (
    projectId: string,
    taskId: string,
    attemptId: string,
    data: {
      title: string;
      body: string | null;
      base_branch: string | null;
    }
  ): Promise<string> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/create-pr`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<string>(response);
  },

  startDevServer: async (
    projectId: string,
    taskId: string,
    attemptId: string
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/start-dev-server`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<void>(response);
  },

  getExecutionProcesses: async (
    projectId: string,
    taskId: string,
    attemptId: string
  ): Promise<ExecutionProcessSummary[]> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/execution-processes`
    );
    return handleApiResponse<ExecutionProcessSummary[]>(response);
  },

  stopExecutionProcess: async (
    projectId: string,
    taskId: string,
    attemptId: string,
    processId: string
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/execution-processes/${processId}/stop`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<void>(response);
  },

  getDetails: async (attemptId: string): Promise<TaskAttempt> => {
    const response = await makeRequest(`/api/attempts/${attemptId}/details`);
    return handleApiResponse<TaskAttempt>(response);
  },

  getAllLogs: async (
    projectId: string,
    taskId: string,
    attemptId: string
  ): Promise<ProcessLogsResponse[]> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/logs`
    );
    return handleApiResponse(response);
  },
};

// Execution Process APIs
export const executionProcessesApi = {
  getDetails: async (
    projectId: string,
    processId: string
  ): Promise<ExecutionProcess> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/execution-processes/${processId}`
    );
    return handleApiResponse<ExecutionProcess>(response);
  },
};

// File System APIs
export const fileSystemApi = {
  list: async (path?: string): Promise<DirectoryListResponse> => {
    const queryParam = path ? `?path=${encodeURIComponent(path)}` : '';
    const response = await makeRequest(`/api/filesystem/list${queryParam}`);
    return handleApiResponse<DirectoryListResponse>(response);
  },
};

// Config APIs
export const configApi = {
  getConfig: async (): Promise<Config> => {
    const response = await makeRequest('/api/config');
    return handleApiResponse<Config>(response);
  },
  saveConfig: async (config: Config): Promise<Config> => {
    const response = await makeRequest('/api/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
    return handleApiResponse<Config>(response);
  },
};

// GitHub Device Auth APIs
export const githubAuthApi = {
  checkGithubToken: async (): Promise<boolean | undefined> => {
    try {
      const response = await makeRequest('/api/auth/github/check');
      const result: ApiResponse<null> = await response.json();
      if (!result.success && result.message === 'github_token_invalid') {
        return false;
      }
      return result.success;
    } catch (err) {
      // On network/server error, return undefined (unknown)
      return undefined;
    }
  },
  start: async (): Promise<DeviceStartResponse> => {
    const response = await makeRequest('/api/auth/github/device/start', {
      method: 'POST',
    });
    return handleApiResponse<DeviceStartResponse>(response);
  },
  poll: async (device_code: string): Promise<string> => {
    const response = await makeRequest('/api/auth/github/device/poll', {
      method: 'POST',
      body: JSON.stringify({ device_code }),
      headers: { 'Content-Type': 'application/json' },
    });
    return handleApiResponse<string>(response);
  },
};

// Task Templates APIs
export const templatesApi = {
  list: async (): Promise<TaskTemplate[]> => {
    const response = await makeRequest('/api/templates');
    return handleApiResponse<TaskTemplate[]>(response);
  },

  listGlobal: async (): Promise<TaskTemplate[]> => {
    const response = await makeRequest('/api/templates/global');
    return handleApiResponse<TaskTemplate[]>(response);
  },

  listByProject: async (projectId: string): Promise<TaskTemplate[]> => {
    const response = await makeRequest(`/api/projects/${projectId}/templates`);
    return handleApiResponse<TaskTemplate[]>(response);
  },

  get: async (templateId: string): Promise<TaskTemplate> => {
    const response = await makeRequest(`/api/templates/${templateId}`);
    return handleApiResponse<TaskTemplate>(response);
  },

  create: async (data: CreateTaskTemplate): Promise<TaskTemplate> => {
    const response = await makeRequest('/api/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TaskTemplate>(response);
  },

  update: async (
    templateId: string,
    data: UpdateTaskTemplate
  ): Promise<TaskTemplate> => {
    const response = await makeRequest(`/api/templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TaskTemplate>(response);
  },

  delete: async (templateId: string): Promise<void> => {
    const response = await makeRequest(`/api/templates/${templateId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },
};

// MCP Servers APIs
export const mcpServersApi = {
  load: async (executor: string): Promise<any> => {
    const response = await makeRequest(
      `/api/mcp-servers?executor=${encodeURIComponent(executor)}`
    );
    return handleApiResponse<any>(response);
  },
  save: async (executor: string, serversConfig: any): Promise<void> => {
    const response = await makeRequest(
      `/api/mcp-servers?executor=${encodeURIComponent(executor)}`,
      {
        method: 'POST',
        body: JSON.stringify(serversConfig),
      }
    );
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
