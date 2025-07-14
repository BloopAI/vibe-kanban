// Import all necessary types from shared types
import type {
  Project,
  ProjectWithBranch,
  CreateProject,
  UpdateProject,
  GitBranch,
  Task,
  TaskWithAttemptStatus,
  CreateTask,
  CreateTaskAndStart,
  UpdateTask,
  TaskAttempt,
  CreateTaskAttempt,
  CreateFollowUpAttempt,
  TaskAttemptActivityWithPrompt,
  TaskAttemptState,
  WorktreeDiff,
  BranchStatus,
  ExecutionProcess,
  ExecutionProcessSummary,
  NormalizedConversation,
  DirectoryEntry,
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
    
    throw new ApiError(errorMessage, response.status, response);
  }

  const result: ApiResponse<T> = await response.json();
  
  if (!result.success) {
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
    });
    return handleApiResponse<void>(response);
  },

  getBranches: async (id: string): Promise<GitBranch[]> => {
    const response = await makeRequest(`/api/projects/${id}/branches`);
    return handleApiResponse<GitBranch[]>(response);
  },

  searchFiles: async (id: string, query: string): Promise<FileSearchResult[]> => {
    const response = await makeRequest(`/api/projects/${id}/search?q=${encodeURIComponent(query)}`);
    return handleApiResponse<FileSearchResult[]>(response);
  },
};

// Task Management APIs
export const tasksApi = {
  getAll: async (projectId: string): Promise<TaskWithAttemptStatus[]> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks`);
    return handleApiResponse<TaskWithAttemptStatus[]>(response);
  },

  create: async (projectId: string, data: CreateTask): Promise<Task> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Task>(response);
  },

  createAndStart: async (projectId: string, data: CreateTaskAndStart): Promise<TaskWithAttemptStatus> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/create-and-start`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TaskWithAttemptStatus>(response);
  },

  update: async (projectId: string, taskId: string, data: UpdateTask): Promise<Task> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Task>(response);
  },

  delete: async (projectId: string, taskId: string): Promise<void> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },
};

// Task Attempts APIs
export const attemptsApi = {
  getAll: async (projectId: string, taskId: string): Promise<TaskAttempt[]> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts`);
    return handleApiResponse<TaskAttempt[]>(response);
  },

  create: async (projectId: string, taskId: string, data: CreateTaskAttempt): Promise<TaskAttempt> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TaskAttempt>(response);
  },

  getState: async (projectId: string, taskId: string, attemptId: string): Promise<TaskAttemptState> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}`);
    return handleApiResponse<TaskAttemptState>(response);
  },

  stop: async (projectId: string, taskId: string, attemptId: string): Promise<void> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/stop`, {
      method: 'POST',
    });
    return handleApiResponse<void>(response);
  },

  followUp: async (projectId: string, taskId: string, attemptId: string, data: CreateFollowUpAttempt): Promise<void> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/follow-up`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<void>(response);
  },

  getActivities: async (projectId: string, taskId: string, attemptId: string): Promise<TaskAttemptActivityWithPrompt[]> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/activities`);
    return handleApiResponse<TaskAttemptActivityWithPrompt[]>(response);
  },

  getDiff: async (projectId: string, taskId: string, attemptId: string): Promise<WorktreeDiff> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/diff`);
    return handleApiResponse<WorktreeDiff>(response);
  },

  deleteFile: async (projectId: string, taskId: string, attemptId: string, data: { file_path: string }): Promise<void> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/delete-file`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<void>(response);
  },

  openEditor: async (projectId: string, taskId: string, attemptId: string): Promise<void> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/open-editor`, {
      method: 'POST',
    });
    return handleApiResponse<void>(response);
  },

  getBranchStatus: async (projectId: string, taskId: string, attemptId: string): Promise<BranchStatus> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/branch-status`);
    return handleApiResponse<BranchStatus>(response);
  },

  merge: async (projectId: string, taskId: string, attemptId: string): Promise<void> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/merge`, {
      method: 'POST',
    });
    return handleApiResponse<void>(response);
  },

  rebase: async (projectId: string, taskId: string, attemptId: string): Promise<void> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/rebase`, {
      method: 'POST',
    });
    return handleApiResponse<void>(response);
  },

  createPR: async (projectId: string, taskId: string, attemptId: string, data: { title: string; body: string }): Promise<string> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/create-pr`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<string>(response);
  },

  startDevServer: async (projectId: string, taskId: string, attemptId: string): Promise<void> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/start-dev-server`, {
      method: 'POST',
    });
    return handleApiResponse<void>(response);
  },

  getExecutionProcesses: async (projectId: string, taskId: string, attemptId: string): Promise<ExecutionProcessSummary[]> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/execution-processes`);
    return handleApiResponse<ExecutionProcessSummary[]>(response);
  },

  stopExecutionProcess: async (projectId: string, taskId: string, attemptId: string, processId: string): Promise<void> => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/execution-processes/${processId}/stop`, {
      method: 'POST',
    });
    return handleApiResponse<void>(response);
  },
};

// Execution Process APIs
export const executionProcessesApi = {
  getDetails: async (projectId: string, processId: string): Promise<ExecutionProcess> => {
    const response = await makeRequest(`/api/projects/${projectId}/execution-processes/${processId}`);
    return handleApiResponse<ExecutionProcess>(response);
  },

  getNormalizedLogs: async (projectId: string, processId: string): Promise<NormalizedConversation> => {
    const response = await makeRequest(`/api/projects/${projectId}/execution-processes/${processId}/normalized-logs`);
    return handleApiResponse<NormalizedConversation>(response);
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

// Utility function for error handling in components
export const withErrorHandling = async <T>(
  apiCall: () => Promise<T>,
  onError: (error: ApiError) => void
): Promise<T | undefined> => {
  try {
    return await apiCall();
  } catch (error) {
    if (error instanceof ApiError) {
      onError(error);
    } else {
      onError(new ApiError('An unexpected error occurred'));
    }
    return undefined;
  }
};
