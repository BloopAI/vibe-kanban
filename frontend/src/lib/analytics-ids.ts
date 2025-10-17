/**
 * Analytics ID enum for PostHog autocapture
 *
 * Format: {page}-{component}-{action}-{type}
 *
 * Usage:
 *   import { AnalyticsId } from '@/lib/analytics-ids';
 *   <Button analyticsId={AnalyticsId.TASK_CREATE_BUTTON}>Create</Button>
 *
 * Only elements with data-ph-capture-attribute will be tracked by autocapture.
 * This ensures stable, semantic identification that survives UI changes.
 *
 * TypeScript enforces that ONLY values from this enum can be used - no random strings!
 */
export enum AnalyticsId {
  // Task Management
  TASK_CREATE_BUTTON = 'task-form-create-button',
  TASK_UPDATE_BUTTON = 'task-form-update-button',
  TASK_CANCEL_BUTTON = 'task-form-cancel-button',
  TASK_CREATE_AND_START_BUTTON = 'task-form-create-and-start-button',
  TASK_DELETE_ACTION = 'task-card-delete-action',
  TASK_EDIT_ACTION = 'task-card-edit-action',
  TASK_CARD_CLICK = 'kanban-task-card-click',

  // Attempt Management
  ATTEMPT_CREATE_BUTTON = 'attempt-create-submit-button',
  ATTEMPT_EXECUTOR_SELECT = 'attempt-executor-select',
  ATTEMPT_CANCEL_BUTTON = 'attempt-create-cancel-button',

  // PR Management
  PR_CREATE_BUTTON = 'pr-create-submit-button',
  PR_CANCEL_BUTTON = 'pr-create-cancel-button',

  // Settings
  SETTINGS_SAVE_BUTTON = 'settings-save-button',
  SETTINGS_ANALYTICS_TOGGLE = 'settings-analytics-toggle',
  SETTINGS_THEME_SELECT = 'settings-theme-select',

  // Project Management
  PROJECT_CREATE_BUTTON = 'project-form-create-button',
  PROJECT_DELETE_ACTION = 'project-card-delete-action',
  PROJECT_EDIT_ACTION = 'project-card-edit-action',

  // Navigation
  NAV_PROJECTS_LINK = 'nav-projects-link',
  NAV_SETTINGS_LINK = 'nav-settings-link',

  // Add more IDs as you instrument the UI...
}
