/**
 * Types for remote project operations proxied through the Hive.
 * These types mirror the Hive's task management API responses.
 */

import type { TaskStatus } from 'shared/types';

/** User data from the Hive's identity system */
export interface HiveUserData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
}

/** Shared task from the Hive */
export interface HiveSharedTask {
  id: string;
  organization_id: string;
  project_id: string;
  creator_user_id: string | null;
  assignee_user_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Shared task with user data for display */
export interface HiveSharedTaskWithUser {
  task: HiveSharedTask;
  user: HiveUserData | null;
}

/** Bulk shared tasks response from the Hive */
export interface BulkSharedTasksResponse {
  tasks: HiveSharedTaskWithUser[];
  deleted_task_ids: string[];
  latest_seq: number | null;
}

/** Response when creating/updating a shared task */
export interface SharedTaskResponse {
  task: HiveSharedTask;
  user: HiveUserData | null;
}
