use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::{get_txid, types::IssuePriority};
use crate::mutation_types::{DeleteResponse, MutationResponse};

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

    pub async fn organization_id(
        pool: &PgPool,
        issue_id: Uuid,
    ) -> Result<Option<Uuid>, IssueError> {
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
    ) -> Result<MutationResponse<Issue>, IssueError> {
        let mut tx = pool.begin().await?;

        let id = id.unwrap_or_else(Uuid::new_v4);
        let data = sqlx::query_as!(
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
        .fetch_one(&mut *tx)
        .await?;

        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;

        Ok(MutationResponse { data, txid })
    }

    /// Update an issue with partial fields.
    ///
    /// For non-nullable fields, uses COALESCE to preserve existing values when None is provided.
    /// For nullable fields (Option<Option<T>>), uses CASE to distinguish between:
    /// - None: don't update the field
    /// - Some(None): set the field to NULL
    /// - Some(Some(value)): set the field to the value
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
    ) -> Result<MutationResponse<Issue>, IssueError> {
        let mut tx = pool.begin().await?;

        // For nullable fields, extract boolean flags and flattened values
        // This preserves the distinction between "don't update" and "set to NULL"
        let update_description = description.is_some();
        let description_value = description.flatten();
        let update_start_date = start_date.is_some();
        let start_date_value = start_date.flatten();
        let update_target_date = target_date.is_some();
        let target_date_value = target_date.flatten();
        let update_completed_at = completed_at.is_some();
        let completed_at_value = completed_at.flatten();
        let update_parent_issue_id = parent_issue_id.is_some();
        let parent_issue_id_value = parent_issue_id.flatten();

        let data = sqlx::query_as!(
            Issue,
            r#"
            UPDATE issues
            SET
                status_id = COALESCE($1, status_id),
                title = COALESCE($2, title),
                description = CASE WHEN $3 THEN $4 ELSE description END,
                priority = COALESCE($5, priority),
                start_date = CASE WHEN $6 THEN $7 ELSE start_date END,
                target_date = CASE WHEN $8 THEN $9 ELSE target_date END,
                completed_at = CASE WHEN $10 THEN $11 ELSE completed_at END,
                sort_order = COALESCE($12, sort_order),
                parent_issue_id = CASE WHEN $13 THEN $14 ELSE parent_issue_id END,
                extension_metadata = COALESCE($15, extension_metadata),
                updated_at = NOW()
            WHERE id = $16
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
            update_description,
            description_value,
            priority as Option<IssuePriority>,
            update_start_date,
            start_date_value,
            update_target_date,
            target_date_value,
            update_completed_at,
            completed_at_value,
            sort_order,
            update_parent_issue_id,
            parent_issue_id_value,
            extension_metadata,
            id
        )
        .fetch_one(&mut *tx)
        .await?;

        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;

        Ok(MutationResponse { data, txid })
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<DeleteResponse, IssueError> {
        let mut tx = pool.begin().await?;

        sqlx::query!("DELETE FROM issues WHERE id = $1", id)
            .execute(&mut *tx)
            .await?;

        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;

        Ok(DeleteResponse { txid })
    }
}
