/**
 * API module - Re-exports from all API submodules.
 *
 * This file will be populated as endpoints are migrated from lib/api.ts.
 */

// Utils
export {
  ApiError,
  REQUEST_TIMEOUT_MS,
  anySignal,
  makeRequest,
  handleApiResponse,
  handleApiResponseAsResult,
} from './utils';

export type { Ok, Err, Result } from './utils';

// Projects API
export { projectsApi } from './projects';

// Tasks API
export { tasksApi } from './tasks';
export type {
  ProjectNodeInfo,
  ListProjectNodesResponse,
  TaskStreamConnectionInfoResponse,
} from './tasks';

// Task Attempts API
export { attemptsApi } from './attempts';

// Re-export draft types used in hooks
export type {
  UpdateFollowUpDraftRequest,
  UpdateRetryFollowUpDraftRequest,
} from 'shared/types';

// Task Variables API
export { taskVariablesApi } from './taskVariables';

// Commits API
export { commitsApi } from './commits';

// Health API
export { healthApi } from './health';
export type { HealthResponse } from './health';

// Config API
export { configApi } from './config';

// Filesystem APIs
export { fileSystemApi, fileBrowserApi } from './filesystem';

// Execution Processes API
export { executionProcessesApi } from './execution';

// Templates API
export { templatesApi } from './templates';

// Labels API
export { labelsApi } from './labels';

// MCP Servers API
export { mcpServersApi } from './mcp';

// Profiles API
export { profilesApi } from './profiles';

// Images API
export { imagesApi } from './images';

// Approvals API
export { approvalsApi } from './approvals';

// OAuth API
export { oauthApi } from './oauth';

// Organizations API
export { organizationsApi } from './organizations';

// Dashboard API
export { dashboardApi } from './dashboard';

// Nodes API (swarm/hive architecture)
export { nodesApi } from './nodes';

// Swarm Projects API
export { swarmProjectsApi } from './swarmProjects';

// Swarm Labels API
export { swarmLabelsApi } from './swarmLabels';

// Swarm Templates API
export { swarmTemplatesApi } from './swarmTemplates';

// Backups API
export { backupsApi } from './backups';

// Diagnostics API
export { diagnosticsApi } from './diagnostics';

// Processes API
export { processesApi } from './processes';

// Logs API
export { logsApi } from './logs';
export type { LogsPaginationParams } from './logs';

// Terminal API
export { terminalApi } from './terminal';
export type { CreateTerminalSessionRequest } from './terminal';

// Message Queue API
export { messageQueueApi } from './messageQueue';

// Database API
export { databaseApi } from './database';

// Webhooks API
export { webhooksApi } from './webhooks';
export type { WebhookTestResult } from './webhooks';
