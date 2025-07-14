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
  getAll: async () => {
    const response = await makeRequest('/api/projects');
    return handleApiResponse(response);
  },

  getById: async (id: string) => {
    const response = await makeRequest(`/api/projects/${id}`);
    return handleApiResponse(response);
  },

  getWithBranch: async (id: string) => {
    const response = await makeRequest(`/api/projects/${id}/with-branch`);
    return handleApiResponse(response);
  },

  create: async (data: any) => {
    const response = await makeRequest('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse(response);
  },

  update: async (id: string, data: any) => {
    const response = await makeRequest(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse(response);
  },

  delete: async (id: string) => {
    const response = await makeRequest(`/api/projects/${id}`, {
      method: 'DELETE',
    });
    return handleApiResponse(response);
  },

  openEditor: async (id: string) => {
    const response = await makeRequest(`/api/projects/${id}/open-editor`, {
      method: 'POST',
    });
    return handleApiResponse(response);
  },

  getBranches: async (id: string) => {
    const response = await makeRequest(`/api/projects/${id}/branches`);
    return handleApiResponse(response);
  },

  searchFiles: async (id: string, query: string) => {
    const response = await makeRequest(`/api/projects/${id}/search?q=${encodeURIComponent(query)}`);
    return handleApiResponse(response);
  },
};

// Task Management APIs
export const tasksApi = {
  getAll: async (projectId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks`);
    return handleApiResponse(response);
  },

  create: async (projectId: string, data: any) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse(response);
  },

  createAndStart: async (projectId: string, data: any) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/create-and-start`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse(response);
  },

  update: async (projectId: string, taskId: string, data: any) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse(response);
  },

  delete: async (projectId: string, taskId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}`, {
      method: 'DELETE',
    });
    return handleApiResponse(response);
  },
};

// Task Attempts APIs
export const attemptsApi = {
  getAll: async (projectId: string, taskId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts`);
    return handleApiResponse(response);
  },

  create: async (projectId: string, taskId: string, data: any) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse(response);
  },

  getState: async (projectId: string, taskId: string, attemptId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}`);
    return handleApiResponse(response);
  },

  stop: async (projectId: string, taskId: string, attemptId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/stop`, {
      method: 'POST',
    });
    return handleApiResponse(response);
  },

  followUp: async (projectId: string, taskId: string, attemptId: string, data: any) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/follow-up`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse(response);
  },

  getActivities: async (projectId: string, taskId: string, attemptId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/activities`);
    return handleApiResponse(response);
  },

  getDiff: async (projectId: string, taskId: string, attemptId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/diff`);
    return handleApiResponse(response);
  },

  deleteFile: async (projectId: string, taskId: string, attemptId: string, data: any) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/delete-file`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse(response);
  },

  openEditor: async (projectId: string, taskId: string, attemptId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/open-editor`, {
      method: 'POST',
    });
    return handleApiResponse(response);
  },

  getBranchStatus: async (projectId: string, taskId: string, attemptId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/branch-status`);
    return handleApiResponse(response);
  },

  merge: async (projectId: string, taskId: string, attemptId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/merge`, {
      method: 'POST',
    });
    return handleApiResponse(response);
  },

  rebase: async (projectId: string, taskId: string, attemptId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/rebase`, {
      method: 'POST',
    });
    return handleApiResponse(response);
  },

  createPR: async (projectId: string, taskId: string, attemptId: string, data: any) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/create-pr`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse(response);
  },

  startDevServer: async (projectId: string, taskId: string, attemptId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/start-dev-server`, {
      method: 'POST',
    });
    return handleApiResponse(response);
  },

  getExecutionProcesses: async (projectId: string, taskId: string, attemptId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/execution-processes`);
    return handleApiResponse(response);
  },

  stopExecutionProcess: async (projectId: string, taskId: string, attemptId: string, processId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/execution-processes/${processId}/stop`, {
      method: 'POST',
    });
    return handleApiResponse(response);
  },
};

// Execution Process APIs
export const executionProcessesApi = {
  getDetails: async (projectId: string, processId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/execution-processes/${processId}`);
    return handleApiResponse(response);
  },

  getNormalizedLogs: async (projectId: string, processId: string) => {
    const response = await makeRequest(`/api/projects/${projectId}/execution-processes/${processId}/normalized-logs`);
    return handleApiResponse(response);
  },
};

// File System APIs
export const fileSystemApi = {
  list: async (path?: string) => {
    const queryParam = path ? `?path=${encodeURIComponent(path)}` : '';
    const response = await makeRequest(`/api/filesystem/list${queryParam}`);
    return handleApiResponse(response);
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
