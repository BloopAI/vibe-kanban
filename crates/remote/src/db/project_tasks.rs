use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Executor, Postgres};
use thiserror::Error;
use uuid::Uuid;

use super::types::TaskPriority;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectTask {
    pub id: Uuid,
    pub project_id: Uuid,
    pub status_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub priority: TaskPriority,
    pub start_date: Option<DateTime<Utc>>,
    pub target_date: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub sort_order: f64,
    pub parent_task_id: Option<Uuid>,
    pub extension_metadata: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum ProjectTaskError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct ProjectTaskRepository;

impl ProjectTaskRepository {
    pub async fn find_by_id<'e, E>(
        executor: E,
        id: Uuid,
    ) -> Result<Option<ProjectTask>, ProjectTaskError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            ProjectTask,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                status_id           AS "status_id!: Uuid",
                title               AS "title!",
                description         AS "description?",
                priority            AS "priority!: TaskPriority",
                start_date          AS "start_date?: DateTime<Utc>",
                target_date         AS "target_date?: DateTime<Utc>",
                completed_at        AS "completed_at?: DateTime<Utc>",
                sort_order          AS "sort_order!",
                parent_task_id      AS "parent_task_id?: Uuid",
                extension_metadata  AS "extension_metadata!: Value",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            FROM tasks
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }

    pub async fn organization_id<'e, E>(
        executor: E,
        task_id: Uuid,
    ) -> Result<Option<Uuid>, ProjectTaskError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_scalar!(
            r#"
            SELECT p.organization_id
            FROM tasks t
            INNER JOIN projects p ON p.id = t.project_id
            WHERE t.id = $1
            "#,
            task_id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }
}
