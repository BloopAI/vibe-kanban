import { 
  Integration, 
  IntegrationWithCategory, 
  IntegrationCategory,
  IntegrationEvent,
  CreateIntegrationRequest,
  UpdateIntegrationRequest,
  IntegrationTestResult
} from '@/lib/types/integrations';

const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

class IntegrationsApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'IntegrationsApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new IntegrationsApiError(response.status, `API Error: ${response.status}`);
  }
  
  const result: ApiResponse<T> = await response.json();
  
  if (!result.success) {
    throw new IntegrationsApiError(response.status, result.message || 'API request failed');
  }
  
  return result.data as T;
}

export const integrationsApi = {
  // Categories
  async getCategories(): Promise<IntegrationCategory[]> {
    const response = await fetch(`${API_BASE}/integrations/categories`);
    return handleResponse<IntegrationCategory[]>(response);
  },

  // Integrations CRUD
  async listIntegrations(): Promise<IntegrationWithCategory[]> {
    const response = await fetch(`${API_BASE}/integrations`);
    return handleResponse<IntegrationWithCategory[]>(response);
  },

  async getIntegration(id: string): Promise<IntegrationWithCategory> {
    const response = await fetch(`${API_BASE}/integrations/${id}`);
    return handleResponse<IntegrationWithCategory>(response);
  },

  async createIntegration(request: CreateIntegrationRequest): Promise<Integration> {
    const response = await fetch(`${API_BASE}/integrations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    return handleResponse<Integration>(response);
  },

  async updateIntegration(id: string, request: UpdateIntegrationRequest): Promise<Integration> {
    const response = await fetch(`${API_BASE}/integrations/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    return handleResponse<Integration>(response);
  },

  async deleteIntegration(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/integrations/${id}`, {
      method: 'DELETE',
    });
    await handleResponse<void>(response);
  },

  // Integration actions
  async testIntegration(id: string): Promise<IntegrationTestResult> {
    const response = await fetch(`${API_BASE}/integrations/${id}/test`, {
      method: 'POST',
    });
    return handleResponse<IntegrationTestResult>(response);
  },

  async syncIntegration(id: string): Promise<void> {
    const response = await fetch(`${API_BASE}/integrations/${id}/sync`, {
      method: 'POST',
    });
    await handleResponse<void>(response);
  },

  // Events
  async getIntegrationEvents(id: string): Promise<IntegrationEvent[]> {
    const response = await fetch(`${API_BASE}/integrations/${id}/events`);
    return handleResponse<IntegrationEvent[]>(response);
  },

  // Convenience methods
  async toggleIntegration(id: string, enabled: boolean): Promise<Integration> {
    return this.updateIntegration(id, { enabled });
  },

  async updateIntegrationConfig(id: string, config: Record<string, unknown>): Promise<Integration> {
    return this.updateIntegration(id, { config });
  },
};

export { IntegrationsApiError };
export default integrationsApi;