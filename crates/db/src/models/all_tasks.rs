use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use ts_rs::TS;
use uuid::Uuid;

use super::task::TaskStatus;

/// Task with project information for the "All Projects" view
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskWithProjectInfo {
    // Task fields
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub parent_task_attempt: Option<Uuid>,
    pub shared_task_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub is_remote: bool,
    pub remote_assignee_user_id: Option<Uuid>,
    pub remote_assignee_name: Option<String>,
    pub remote_assignee_username: Option<String>,
    pub remote_version: i64,
    pub remote_last_synced_at: Option<DateTime<Utc>>,
    pub remote_stream_node_id: Option<Uuid>,
    pub remote_stream_url: Option<String>,
    // Attempt status fields
    pub has_in_progress_attempt: bool,
    pub has_merged_attempt: bool,
    pub last_attempt_failed: bool,
    pub executor: String,
    // Project context fields
    pub project_name: String,
    pub source_node_name: Option<String>,
}

/// Response for the all tasks endpoint
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AllTasksResponse {
    pub tasks: Vec<TaskWithProjectInfo>,
}

impl AllTasksResponse {
    /// Fetch all tasks from all projects with project info and attempt status
    pub async fn fetch(pool: &SqlitePool) -> Result<Self, sqlx::Error> {
        let tasks = sqlx::query!(
            r#"SELECT
  t.id                            AS "id!: Uuid",
  t.project_id                    AS "project_id!: Uuid",
  t.title                         AS "title!",
  t.description                   AS "description",
  t.status                        AS "status!: TaskStatus",
  t.parent_task_attempt           AS "parent_task_attempt: Uuid",
  t.shared_task_id                AS "shared_task_id: Uuid",
  t.created_at                    AS "created_at!: DateTime<Utc>",
  t.updated_at                    AS "updated_at!: DateTime<Utc>",
  t.is_remote                     AS "is_remote!: bool",
  t.remote_assignee_user_id       AS "remote_assignee_user_id: Uuid",
  t.remote_assignee_name          AS "remote_assignee_name",
  t.remote_assignee_username      AS "remote_assignee_username",
  t.remote_version                AS "remote_version!: i64",
  t.remote_last_synced_at         AS "remote_last_synced_at: DateTime<Utc>",
  t.remote_stream_node_id         AS "remote_stream_node_id: Uuid",
  t.remote_stream_url             AS "remote_stream_url",

  -- Project context
  p.name                          AS "project_name!",
  p.source_node_name              AS "source_node_name",

  -- Attempt status: has_in_progress_attempt
  CASE WHEN EXISTS (
    SELECT 1
      FROM task_attempts ta
      JOIN execution_processes ep
        ON ep.task_attempt_id = ta.id
     WHERE ta.task_id = t.id
       AND ep.status = 'running'
       AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
     LIMIT 1
  ) THEN 1 ELSE 0 END             AS "has_in_progress_attempt!: i64",

  -- Attempt status: has_merged_attempt
  CASE WHEN EXISTS (
    SELECT 1
      FROM task_attempts ta
      JOIN merges m ON m.task_attempt_id = ta.id
     WHERE ta.task_id = t.id
     LIMIT 1
  ) THEN 1 ELSE 0 END             AS "has_merged_attempt!: i64",

  -- Attempt status: last_attempt_failed
  CASE WHEN EXISTS (
    SELECT 1
      FROM task_attempts ta
      JOIN execution_processes ep
        ON ep.task_attempt_id = ta.id
     WHERE ta.task_id = t.id
       AND ep.status = 'failed'
       AND NOT EXISTS (
         SELECT 1 FROM execution_processes ep2
          WHERE ep2.task_attempt_id = ta.id
            AND ep2.status = 'running'
       )
     ORDER BY ta.created_at DESC
     LIMIT 1
  ) THEN 1 ELSE 0 END             AS "last_attempt_failed!: i64",

  -- Latest executor
  COALESCE((
    SELECT ta.executor
      FROM task_attempts ta
     WHERE ta.task_id = t.id
     ORDER BY ta.created_at DESC
     LIMIT 1
  ), '')                          AS "executor!"

FROM tasks t
JOIN projects p ON t.project_id = p.id
ORDER BY t.updated_at DESC"#
        )
        .fetch_all(pool)
        .await?;

        let tasks = tasks
            .into_iter()
            .map(|rec| TaskWithProjectInfo {
                id: rec.id,
                project_id: rec.project_id,
                title: rec.title,
                description: rec.description,
                status: rec.status,
                parent_task_attempt: rec.parent_task_attempt,
                shared_task_id: rec.shared_task_id,
                created_at: rec.created_at,
                updated_at: rec.updated_at,
                is_remote: rec.is_remote,
                remote_assignee_user_id: rec.remote_assignee_user_id,
                remote_assignee_name: rec.remote_assignee_name,
                remote_assignee_username: rec.remote_assignee_username,
                remote_version: rec.remote_version,
                remote_last_synced_at: rec.remote_last_synced_at,
                remote_stream_node_id: rec.remote_stream_node_id,
                remote_stream_url: rec.remote_stream_url,
                has_in_progress_attempt: rec.has_in_progress_attempt != 0,
                has_merged_attempt: rec.has_merged_attempt != 0,
                last_attempt_failed: rec.last_attempt_failed != 0,
                executor: rec.executor,
                project_name: rec.project_name,
                source_node_name: rec.source_node_name,
            })
            .collect();

        Ok(AllTasksResponse { tasks })
    }
}
