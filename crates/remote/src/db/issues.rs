use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
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
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Issue>, IssueError> {
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
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    pub async fn organization_id(pool: &PgPool, issue_id: Uuid) -> Result<Option<Uuid>, IssueError> {
        let record = sqlx::query_scalar!(
            r#"
            SELECT p.organization_id
            FROM issues i
            INNER JOIN projects p ON p.id = i.project_id
            WHERE i.id = $1
            "#,
            issue_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    pub async fn list_by_project(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Vec<Issue>, IssueError> {
        let records = sqlx::query_as!(
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
            WHERE project_id = $1
            "#,
            project_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create(
        pool: &PgPool,
        id: Option<Uuid>,
        project_id: Uuid,
        status_id: Uuid,
        title: String,
        description: Option<String>,
        priority: IssuePriority,
        start_date: Option<DateTime<Utc>>,
        target_date: Option<DateTime<Utc>>,
        completed_at: Option<DateTime<Utc>>,
        sort_order: f64,
        parent_issue_id: Option<Uuid>,
        extension_metadata: Value,
    ) -> Result<Issue, IssueError> {
        let id = id.unwrap_or_else(Uuid::new_v4);
        let record = sqlx::query_as!(
            Issue,
            r#"
            INSERT INTO issues (
                id, project_id, status_id, title, description, priority,
                start_date, target_date, completed_at, sort_order,
                parent_issue_id, extension_metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING
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
            "#,
            id,
            project_id,
            status_id,
            title,
            description,
            priority as IssuePriority,
            start_date,
            target_date,
            completed_at,
            sort_order,
            parent_issue_id,
            extension_metadata
        )
        .fetch_one(pool)
        .await?;

        Ok(record)
    }

    /// Update an issue with partial fields. Uses COALESCE to preserve existing values
    /// when None is provided.
    #[allow(clippy::too_many_arguments)]
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        status_id: Option<Uuid>,
        title: Option<String>,
        description: Option<Option<String>>,
        priority: Option<IssuePriority>,
        start_date: Option<Option<DateTime<Utc>>>,
        target_date: Option<Option<DateTime<Utc>>>,
        completed_at: Option<Option<DateTime<Utc>>>,
        sort_order: Option<f64>,
        parent_issue_id: Option<Option<Uuid>>,
        extension_metadata: Option<Value>,
    ) -> Result<Issue, IssueError> {
        let record = sqlx::query_as!(
            Issue,
            r#"
            UPDATE issues
            SET
                status_id = COALESCE($1, status_id),
                title = COALESCE($2, title),
                description = COALESCE($3, description),
                priority = COALESCE($4, priority),
                start_date = COALESCE($5, start_date),
                target_date = COALESCE($6, target_date),
                completed_at = COALESCE($7, completed_at),
                sort_order = COALESCE($8, sort_order),
                parent_issue_id = COALESCE($9, parent_issue_id),
                extension_metadata = COALESCE($10, extension_metadata),
                updated_at = NOW()
            WHERE id = $11
            RETURNING
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
            "#,
            status_id,
            title,
            description.flatten(),
            priority as Option<IssuePriority>,
            start_date.flatten(),
            target_date.flatten(),
            completed_at.flatten(),
            sort_order,
            parent_issue_id.flatten(),
            extension_metadata,
            id
        )
        .fetch_one(pool)
        .await?;

        Ok(record)
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), IssueError> {
        sqlx::query!("DELETE FROM issues WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
