use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use ts_rs::TS;
use uuid::Uuid;

use super::task::TaskStatus;

/// A task summary for the dashboard view, containing essential info plus project context
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DashboardTask {
    pub task_id: Uuid,
    pub task_title: String,
    pub project_id: Uuid,
    pub project_name: String,
    pub status: TaskStatus,
    pub executor: String,
    pub updated_at: DateTime<Utc>,
}

/// Summary of active tasks across all projects for dashboard display
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DashboardSummary {
    pub running_tasks: Vec<DashboardTask>,
    pub in_review_tasks: Vec<DashboardTask>,
}

impl DashboardSummary {
    /// Fetch dashboard summary across all projects
    /// Returns tasks that are either:
    /// - In Progress with a running execution process (running_tasks)
    /// - In Review status (in_review_tasks)
    pub async fn fetch(pool: &SqlitePool) -> Result<Self, sqlx::Error> {
        let records = sqlx::query!(
            r#"SELECT
  t.id                            AS "task_id!: Uuid",
  t.title                         AS task_title,
  t.project_id                    AS "project_id!: Uuid",
  p.name                          AS project_name,
  t.status                        AS "status!: TaskStatus",
  t.updated_at                    AS "updated_at!: DateTime<Utc>",

  COALESCE((
    SELECT ta.executor
      FROM task_attempts ta
      WHERE ta.task_id = t.id
     ORDER BY ta.created_at DESC
      LIMIT 1
  ), '')                          AS "executor!: String",

  CASE WHEN EXISTS (
    SELECT 1
      FROM task_attempts ta
      JOIN execution_processes ep
        ON ep.task_attempt_id = ta.id
     WHERE ta.task_id       = t.id
       AND ep.status        = 'running'
       AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
     LIMIT 1
  ) THEN 1 ELSE 0 END            AS "has_running_attempt!: i64"

FROM tasks t
JOIN projects p ON t.project_id = p.id
WHERE
  -- Running: InProgress status AND has running execution process
  (t.status = 'inprogress' AND EXISTS (
    SELECT 1
      FROM task_attempts ta
      JOIN execution_processes ep
        ON ep.task_attempt_id = ta.id
     WHERE ta.task_id = t.id
       AND ep.status = 'running'
       AND ep.run_reason IN ('setupscript','cleanupscript','codingagent')
  ))
  OR
  -- In Review: InReview status (waiting for user input)
  t.status = 'inreview'

ORDER BY t.updated_at DESC"#
        )
        .fetch_all(pool)
        .await?;

        let mut running_tasks = Vec::new();
        let mut in_review_tasks = Vec::new();

        for rec in records {
            let task = DashboardTask {
                task_id: rec.task_id,
                task_title: rec.task_title,
                project_id: rec.project_id,
                project_name: rec.project_name,
                status: rec.status.clone(),
                executor: rec.executor,
                updated_at: rec.updated_at,
            };

            // Categorize based on status and running state
            if rec.status == TaskStatus::InProgress && rec.has_running_attempt != 0 {
                running_tasks.push(task);
            } else if rec.status == TaskStatus::InReview {
                in_review_tasks.push(task);
            }
        }

        Ok(DashboardSummary {
            running_tasks,
            in_review_tasks,
        })
    }
}
