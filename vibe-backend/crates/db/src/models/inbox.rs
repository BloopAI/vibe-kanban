use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, PgPool, Postgres, Type};
use strum_macros::{Display, EnumString};
use ts_rs::TS;
use uuid::Uuid;

/// Types of notifications that can be sent to the inbox
#[derive(
    Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display, Default,
)]
#[sqlx(type_name = "inbox_notification_type", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub enum InboxNotificationType {
    #[default]
    TaskAssigned,
    TaskMentioned,
    TaskComment,
    TaskStatusChanged,
    TaskCompleted,
    WorkspaceCreated,
    SystemNotification,
}

/// An inbox item/notification
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct InboxItem {
    pub id: Uuid,
    pub notification_type: InboxNotificationType,
    pub title: String,
    pub message: Option<String>,
    pub task_id: Option<Uuid>,
    pub project_id: Option<Uuid>,
    pub workspace_id: Option<Uuid>,
    pub is_read: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Data required to create a new inbox item
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateInboxItem {
    pub notification_type: InboxNotificationType,
    pub title: String,
    pub message: Option<String>,
    pub task_id: Option<Uuid>,
    pub project_id: Option<Uuid>,
    pub workspace_id: Option<Uuid>,
}

/// Summary of inbox items (for badges, etc.)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct InboxSummary {
    pub total_count: i64,
    pub unread_count: i64,
}

impl InboxItem {
    /// Find all inbox items, ordered by most recent first
    pub async fn find_all(pool: &PgPool, limit: Option<i64>) -> Result<Vec<Self>, sqlx::Error> {
        let limit = limit.unwrap_or(100);
        sqlx::query_as!(
            InboxItem,
            r#"SELECT
                id as "id!: Uuid",
                notification_type as "notification_type!: InboxNotificationType",
                title,
                message,
                task_id as "task_id: Uuid",
                project_id as "project_id: Uuid",
                workspace_id as "workspace_id: Uuid",
                is_read as "is_read!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM inbox_items
            ORDER BY created_at DESC
            LIMIT $1"#,
            limit
        )
        .fetch_all(pool)
        .await
    }

    /// Find all unread inbox items
    pub async fn find_unread(
        pool: &PgPool,
        limit: Option<i64>,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let limit = limit.unwrap_or(100);
        sqlx::query_as!(
            InboxItem,
            r#"SELECT
                id as "id!: Uuid",
                notification_type as "notification_type!: InboxNotificationType",
                title,
                message,
                task_id as "task_id: Uuid",
                project_id as "project_id: Uuid",
                workspace_id as "workspace_id: Uuid",
                is_read as "is_read!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM inbox_items
            WHERE is_read = FALSE
            ORDER BY created_at DESC
            LIMIT $1"#,
            limit
        )
        .fetch_all(pool)
        .await
    }

    /// Find an inbox item by ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            InboxItem,
            r#"SELECT
                id as "id!: Uuid",
                notification_type as "notification_type!: InboxNotificationType",
                title,
                message,
                task_id as "task_id: Uuid",
                project_id as "project_id: Uuid",
                workspace_id as "workspace_id: Uuid",
                is_read as "is_read!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM inbox_items
            WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Create a new inbox item
    pub async fn create(pool: &PgPool, data: &CreateInboxItem) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            InboxItem,
            r#"INSERT INTO inbox_items (id, notification_type, title, message, task_id, project_id, workspace_id, is_read)
            VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
            RETURNING
                id as "id!: Uuid",
                notification_type as "notification_type!: InboxNotificationType",
                title,
                message,
                task_id as "task_id: Uuid",
                project_id as "project_id: Uuid",
                workspace_id as "workspace_id: Uuid",
                is_read as "is_read!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.notification_type,
            data.title,
            data.message,
            data.task_id,
            data.project_id,
            data.workspace_id
        )
        .fetch_one(pool)
        .await
    }

    /// Mark an inbox item as read
    pub async fn mark_as_read(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            InboxItem,
            r#"UPDATE inbox_items
            SET is_read = TRUE, updated_at = NOW()
            WHERE id = $1
            RETURNING
                id as "id!: Uuid",
                notification_type as "notification_type!: InboxNotificationType",
                title,
                message,
                task_id as "task_id: Uuid",
                project_id as "project_id: Uuid",
                workspace_id as "workspace_id: Uuid",
                is_read as "is_read!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Mark all inbox items as read
    pub async fn mark_all_as_read(pool: &PgPool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "UPDATE inbox_items SET is_read = TRUE, updated_at = NOW() WHERE is_read = FALSE"
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Delete an inbox item
    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let result = sqlx::query!("DELETE FROM inbox_items WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }

    /// Count unread inbox items
    pub async fn count_unread(pool: &PgPool) -> Result<i64, sqlx::Error> {
        let result = sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!: i64" FROM inbox_items WHERE is_read = FALSE"#
        )
        .fetch_one(pool)
        .await?;
        Ok(result)
    }

    /// Get inbox summary (total and unread counts)
    pub async fn get_summary(pool: &PgPool) -> Result<InboxSummary, sqlx::Error> {
        let result = sqlx::query!(
            r#"SELECT
                COUNT(*) as "total_count!: i64",
                SUM(CASE WHEN is_read = FALSE THEN 1 ELSE 0 END) as "unread_count!: i64"
            FROM inbox_items"#
        )
        .fetch_one(pool)
        .await?;

        Ok(InboxSummary {
            total_count: result.total_count,
            unread_count: result.unread_count,
        })
    }

    /// Delete all inbox items related to a task
    pub async fn delete_by_task_id<'e, E>(executor: E, task_id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let result = sqlx::query!("DELETE FROM inbox_items WHERE task_id = $1", task_id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }

    /// Delete all inbox items related to a project
    pub async fn delete_by_project_id<'e, E>(
        executor: E,
        project_id: Uuid,
    ) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let result = sqlx::query!("DELETE FROM inbox_items WHERE project_id = $1", project_id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }

    /// Find inbox items by project ID
    pub async fn find_by_project_id(
        pool: &PgPool,
        project_id: Uuid,
        limit: Option<i64>,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let limit = limit.unwrap_or(100);
        sqlx::query_as!(
            InboxItem,
            r#"SELECT
                id as "id!: Uuid",
                notification_type as "notification_type!: InboxNotificationType",
                title,
                message,
                task_id as "task_id: Uuid",
                project_id as "project_id: Uuid",
                workspace_id as "workspace_id: Uuid",
                is_read as "is_read!: bool",
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM inbox_items
            WHERE project_id = $1
            ORDER BY created_at DESC
            LIMIT $2"#,
            project_id,
            limit
        )
        .fetch_all(pool)
        .await
    }
}
