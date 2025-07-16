// Integration types for the frontend
export interface IntegrationCategory {
  id: string;
  display_name: string;
  description?: string;
  icon?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Integration {
  id: string;
  name: string;
  type: string;
  provider: string;
  category_id: string;
  config?: Record<string, unknown>;
  enabled: boolean;
  health_status: 'healthy' | 'error' | 'warning' | 'unknown';
  last_sync_at?: string;
  last_health_check_at?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface IntegrationWithCategory extends Omit<Integration, 'category_id'> {
  category: IntegrationCategory;
}

export interface CreateIntegrationRequest {
  name: string;
  type: string;
  provider: string;
  category_id: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export interface UpdateIntegrationRequest {
  name?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export interface IntegrationTestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface IntegrationEvent {
  id: string;
  integration_id: string;
  event_type: string;
  event_data?: Record<string, unknown>;
  created_at: string;
}

// Integration type constants
export const INTEGRATION_TYPES = {
  AI_ASSISTANT: 'ai_assistant',
  VERSION_CONTROL: 'version_control', 
  COMMUNICATION: 'communication',
  PROJECT_MANAGEMENT: 'project_management',
  DEVELOPMENT_TOOL: 'development_tool',
} as const;

// Health status constants
export const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  ERROR: 'error',
  WARNING: 'warning',
  UNKNOWN: 'unknown',
} as const;

// Event type constants
export const EVENT_TYPES = {
  CREATED: 'created',
  UPDATED: 'updated',
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  SYNC: 'sync',
  TEST: 'test',
  ERROR: 'error',
  HEALTH_CHECK: 'health_check',
} as const;

// Provider constants
export const PROVIDERS = {
  // AI Assistants
  CLAUDE: 'claude',
  AMP: 'amp',
  GEMINI: 'gemini',
  CHARMOPENCODE: 'charmopencode',
  OPENAI: 'openai',
  
  // Version Control
  GITHUB: 'github',
  GITLAB: 'gitlab',
  BITBUCKET: 'bitbucket',
  
  // Communication
  SLACK: 'slack',
  DISCORD: 'discord',
  TEAMS: 'teams',
  
  // Project Management
  JIRA: 'jira',
  LINEAR: 'linear',
  ASANA: 'asana',
  TRELLO: 'trello',
  
  // Development Tools
  VSCODE: 'vscode',
  CURSOR: 'cursor',
  CUSTOM_EDITOR: 'custom_editor',
} as const;

export type IntegrationType = typeof INTEGRATION_TYPES[keyof typeof INTEGRATION_TYPES];
export type HealthStatus = typeof HEALTH_STATUS[keyof typeof HEALTH_STATUS];
export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];
export type Provider = typeof PROVIDERS[keyof typeof PROVIDERS];

// Configuration schemas for different providers
export interface GitHubConfig {
  token?: string;
  organization?: string;
  repositories?: string[];
  webhook_url?: string;
}

export interface SlackConfig {
  workspace_id: string;
  bot_token: string;
  channels: {
    notifications: string;
    task_updates: string;
    errors: string;
  };
  mention_users: string[];
}

export interface MCPConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface JiraConfig {
  server_url: string;
  email: string;
  api_token: string;
  project_key: string;
  issue_type: string;
}

// Union type for all possible configs
export type IntegrationConfig = 
  | GitHubConfig 
  | SlackConfig 
  | MCPConfig 
  | JiraConfig 
  | Record<string, unknown>;

// Helper functions
export function getProviderDisplayName(provider: string): string {
  const displayNames: Record<string, string> = {
    [PROVIDERS.CLAUDE]: 'Claude',
    [PROVIDERS.AMP]: 'Amp',
    [PROVIDERS.GEMINI]: 'Gemini',
    [PROVIDERS.CHARMOPENCODE]: 'CharmOpencode',
    [PROVIDERS.OPENAI]: 'OpenAI',
    [PROVIDERS.GITHUB]: 'GitHub',
    [PROVIDERS.GITLAB]: 'GitLab',
    [PROVIDERS.BITBUCKET]: 'Bitbucket',
    [PROVIDERS.SLACK]: 'Slack',
    [PROVIDERS.DISCORD]: 'Discord',
    [PROVIDERS.TEAMS]: 'Microsoft Teams',
    [PROVIDERS.JIRA]: 'Jira',
    [PROVIDERS.LINEAR]: 'Linear',
    [PROVIDERS.ASANA]: 'Asana',
    [PROVIDERS.TRELLO]: 'Trello',
    [PROVIDERS.VSCODE]: 'VS Code',
    [PROVIDERS.CURSOR]: 'Cursor',
    [PROVIDERS.CUSTOM_EDITOR]: 'Custom Editor',
  };
  
  return displayNames[provider] || provider;
}

export function getHealthStatusColor(status: HealthStatus): string {
  switch (status) {
    case HEALTH_STATUS.HEALTHY:
      return 'text-green-600';
    case HEALTH_STATUS.ERROR:
      return 'text-red-600';
    case HEALTH_STATUS.WARNING:
      return 'text-yellow-600';
    case HEALTH_STATUS.UNKNOWN:
    default:
      return 'text-gray-500';
  }
}

export function getHealthStatusIcon(status: HealthStatus): string {
  switch (status) {
    case HEALTH_STATUS.HEALTHY:
      return 'check-circle';
    case HEALTH_STATUS.ERROR:
      return 'x-circle';
    case HEALTH_STATUS.WARNING:
      return 'alert-triangle';
    case HEALTH_STATUS.UNKNOWN:
    default:
      return 'help-circle';
  }
}