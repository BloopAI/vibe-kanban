/**
 * Webhooks API - Configurable event-driven notifications.
 */

import type {
  WebhookResponse,
  CreateWebhook,
  UpdateWebhook,
} from 'shared/types';

import { makeRequest, handleApiResponse } from './utils';

export interface WebhookTestResult {
  ok: boolean;
  status_code?: number;
  response_time_ms?: number;
  body_preview?: string;
  error?: string;
}

/**
 * Webhooks API namespace - Global and per-project webhook management.
 */
export const webhooksApi = {
  /** List global webhooks (project_id = null) */
  listGlobal: async (): Promise<WebhookResponse[]> => {
    const response = await makeRequest('/api/webhooks');
    return handleApiResponse<WebhookResponse[]>(response);
  },

  /** List webhooks for a specific project */
  listForProject: async (projectId: string): Promise<WebhookResponse[]> => {
    const response = await makeRequest(
      `/api/projects/${projectId}/webhooks`
    );
    return handleApiResponse<WebhookResponse[]>(response);
  },

  /** Create a global webhook */
  createGlobal: async (data: CreateWebhook): Promise<WebhookResponse> => {
    const response = await makeRequest('/api/webhooks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<WebhookResponse>(response);
  },

  /** Create a project-scoped webhook */
  createForProject: async (
    projectId: string,
    data: CreateWebhook
  ): Promise<WebhookResponse> => {
    const response = await makeRequest(`/api/projects/${projectId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<WebhookResponse>(response);
  },

  /** Update a webhook by ID */
  update: async (id: string, data: UpdateWebhook): Promise<WebhookResponse> => {
    const response = await makeRequest(`/api/webhooks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<WebhookResponse>(response);
  },

  /** Delete a webhook by ID */
  delete: async (id: string): Promise<void> => {
    const response = await makeRequest(`/api/webhooks/${id}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  /** Fire a test payload to a webhook's URL */
  test: async (id: string): Promise<WebhookTestResult> => {
    const response = await makeRequest(`/api/webhooks/${id}/test`, {
      method: 'POST',
    });
    return handleApiResponse<WebhookTestResult>(response);
  },
};
