use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Executor, Postgres};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::types::IssuePriority;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Issue {
    pub id: Uuid,
    pub project_id: Uuid,
    pub status_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub priority: IssuePriority,
    pub start_date: Option<DateTime<Utc>>,
    pub target_date: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub sort_order: f64,
    pub parent_issue_id: Option<Uuid>,
    pub extension_metadata: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum IssueError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct IssueRepository;

impl IssueRepository {
    pub async fn find_by_id<'e, E>(executor: E, id: Uuid) -> Result<Option<Issue>, IssueError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            Issue,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                status_id           AS "status_id!: Uuid",
                title               AS "title!",
                description         AS "description?",
                priority            AS "priority!: IssuePriority",
                start_date          AS "start_date?: DateTime<Utc>",
                target_date         AS "target_date?: DateTime<Utc>",
                completed_at        AS "completed_at?: DateTime<Utc>",
                sort_order          AS "sort_order!",
                parent_issue_id     AS "parent_issue_id?: Uuid",
                extension_metadata  AS "extension_metadata!: Value",
                created_at          AS "created_at!: DateTime<Utc>",
                updated_at          AS "updated_at!: DateTime<Utc>"
            FROM issues
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
        issue_id: Uuid,
    ) -> Result<Option<Uuid>, IssueError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_scalar!(
            r#"
            SELECT p.organization_id
            FROM issues i
            INNER JOIN projects p ON p.id = i.project_id
            WHERE i.id = $1
            "#,
            issue_id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }
}
