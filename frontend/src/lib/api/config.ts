/**
 * Configuration API namespace.
 */

import type {
  Config,
  UserSystemInfo,
  EditorType,
  CheckEditorAvailabilityResponse,
  AvailabilityInfo,
  BaseCodingAgent,
} from 'shared/types';
import { makeRequest, handleApiResponse } from './utils';

export interface SlashCommandItem {
  name: string;
  description?: string | null;
}

export interface AgentCommandItem {
  id: string;
  label: string;
  description?: string | null;
  is_default: boolean;
}

export interface SlashCommandsResponse {
  commands: SlashCommandItem[];
  agents: AgentCommandItem[];
}

/**
 * Configuration API namespace for system info and settings.
 */
export const configApi = {
  /**
   * Get the current system configuration and user info.
   */
  getConfig: async (): Promise<UserSystemInfo> => {
    const response = await makeRequest('/api/info');
    return handleApiResponse<UserSystemInfo>(response);
  },

  /**
   * Save updated configuration.
   */
  saveConfig: async (config: Config): Promise<Config> => {
    const response = await makeRequest('/api/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
    return handleApiResponse<Config>(response);
  },

  /**
   * Check if a specific editor type is available on the system.
   */
  checkEditorAvailability: async (
    editorType: EditorType
  ): Promise<CheckEditorAvailabilityResponse> => {
    const response = await makeRequest(
      `/api/editors/check-availability?editor_type=${encodeURIComponent(editorType)}`
    );
    return handleApiResponse<CheckEditorAvailabilityResponse>(response);
  },

  /**
   * Check if a specific coding agent is available on the system.
   */
  checkAgentAvailability: async (
    agent: BaseCodingAgent
  ): Promise<AvailabilityInfo> => {
    const response = await makeRequest(
      `/api/agents/check-availability?executor=${encodeURIComponent(agent)}`
    );
    return handleApiResponse<AvailabilityInfo>(response);
  },

  /**
   * Discover available Claude Code slash commands and agents for a project.
   */
  getSlashCommands: async (
    projectId?: string
  ): Promise<SlashCommandsResponse> => {
    const url = projectId
      ? `/api/slash-commands?project_id=${encodeURIComponent(projectId)}`
      : '/api/slash-commands';
    const response = await makeRequest(url);
    return handleApiResponse<SlashCommandsResponse>(response);
  },
};
