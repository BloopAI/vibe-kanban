use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

use super::task_attempt::TaskAttemptStatus;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskAttemptActivity {
    pub id: Uuid,
    pub execution_process_id: Uuid, // Foreign key to ExecutionProcess
    pub status: TaskAttemptStatus,
    pub note: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateTaskAttemptActivity {
    pub execution_process_id: Uuid,
    pub status: Option<TaskAttemptStatus>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskAttemptActivityWithPrompt {
    pub id: Uuid,
    pub execution_process_id: Uuid,
    pub status: TaskAttemptStatus,
    pub note: Option<String>,
    pub created_at: DateTime<Utc>,
    pub prompt: Option<String>, // From executor_session
}

impl TaskAttemptActivity {
    #[allow(dead_code)]
    pub async fn find_by_execution_process_id(
        pool: &SqlitePool,
        execution_process_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskAttemptActivity,
            r#"SELECT id as "id!: Uuid", execution_process_id as "execution_process_id!: Uuid", status as "status!: TaskAttemptStatus", note, created_at as "created_at!: DateTime<Utc>"
               FROM task_attempt_activities 
               WHERE execution_process_id = $1 
               ORDER BY created_at DESC"#,
            execution_process_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateTaskAttemptActivity,
        activity_id: Uuid,
        status: TaskAttemptStatus,
    ) -> Result<Self, sqlx::Error> {
        let status_value = status as TaskAttemptStatus;
        sqlx::query_as!(
            TaskAttemptActivity,
            r#"INSERT INTO task_attempt_activities (id, execution_process_id, status, note) 
               VALUES ($1, $2, $3, $4) 
               RETURNING id as "id!: Uuid", execution_process_id as "execution_process_id!: Uuid", status as "status!: TaskAttemptStatus", note, created_at as "created_at!: DateTime<Utc>""#,
            activity_id,
            data.execution_process_id,
            status_value,
            data.note
        )
        .fetch_one(pool)
        .await
    }

    #[allow(dead_code)]
    pub async fn find_processes_with_latest_running_status(
        pool: &SqlitePool,
    ) -> Result<Vec<uuid::Uuid>, sqlx::Error> {
        let records = sqlx::query!(
            r#"SELECT DISTINCT ep.id as "id!: Uuid"
               FROM execution_processes ep
               INNER JOIN (
                   SELECT execution_process_id, MAX(created_at) as latest_created_at
                   FROM task_attempt_activities
                   GROUP BY execution_process_id
               ) latest_activity ON ep.id = latest_activity.execution_process_id
               INNER JOIN task_attempt_activities taa ON ep.id = taa.execution_process_id 
                   AND taa.created_at = latest_activity.latest_created_at
               WHERE taa.status IN ($1, $2)"#,
            TaskAttemptStatus::ExecutorRunning as TaskAttemptStatus,
            TaskAttemptStatus::SetupRunning as TaskAttemptStatus
        )
        .fetch_all(pool)
        .await?;

        Ok(records.into_iter().map(|r| r.id).collect())
    }

    /// Find activities for all execution processes in a task attempt, with executor session prompts
    pub async fn find_with_prompts_by_task_attempt_id(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<Vec<TaskAttemptActivityWithPrompt>, sqlx::Error> {
        let records = sqlx::query!(
            r#"SELECT 
                taa.id as "activity_id!: Uuid",
                taa.execution_process_id as "execution_process_id!: Uuid",
                taa.status as "status!: TaskAttemptStatus",
                taa.note,
                taa.created_at as "created_at!: DateTime<Utc>",
                es.prompt
               FROM task_attempt_activities taa
               INNER JOIN execution_processes ep ON taa.execution_process_id = ep.id
               LEFT JOIN executor_sessions es ON es.execution_process_id = ep.id
               WHERE ep.task_attempt_id = $1
               ORDER BY taa.created_at ASC"#,
            task_attempt_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records
            .into_iter()
            .map(|record| TaskAttemptActivityWithPrompt {
                id: record.activity_id,
                execution_process_id: record.execution_process_id,
                status: record.status,
                note: record.note,
                created_at: record.created_at,
                prompt: record.prompt,
            })
            .collect())
    }
}
