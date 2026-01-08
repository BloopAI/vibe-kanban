use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

/// A comment on a task
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TaskComment {
    pub id: Uuid,
    pub task_id: Uuid,
    pub author_id: Option<Uuid>,
    pub author_name: String,
    pub author_email: Option<String>,
    pub content: String,
    pub is_internal: bool,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Request to create a task comment
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct CreateTaskComment {
    pub content: String,
    #[serde(default)]
    pub is_internal: bool,
    pub author_name: String,
    pub author_email: Option<String>,
    pub author_id: Option<Uuid>,
}

/// Request to update a task comment
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpdateTaskComment {
    pub content: Option<String>,
    pub is_internal: Option<bool>,
}

// Helper struct for raw DB rows
#[derive(FromRow)]
struct TaskCommentRow {
    id: Uuid,
    task_id: Uuid,
    author_id: Option<Uuid>,
    author_name: String,
    author_email: Option<String>,
    content: String,
    is_internal: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<TaskCommentRow> for TaskComment {
    fn from(row: TaskCommentRow) -> Self {
        Self {
            id: row.id,
            task_id: row.task_id,
            author_id: row.author_id,
            author_name: row.author_name,
            author_email: row.author_email,
            content: row.content,
            is_internal: row.is_internal,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

impl TaskComment {
    /// Find all comments for a task, ordered by creation time (oldest first)
    pub async fn find_by_task_id(
        pool: &PgPool,
        task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query_as!(
            TaskCommentRow,
            r#"SELECT id as "id!: Uuid",
                      task_id as "task_id!: Uuid",
                      author_id as "author_id: Uuid",
                      author_name,
                      author_email,
                      content,
                      is_internal as "is_internal!: bool",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM task_comments
               WHERE task_id = $1
               ORDER BY created_at ASC"#,
            task_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Find a single comment by ID
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as!(
            TaskCommentRow,
            r#"SELECT id as "id!: Uuid",
                      task_id as "task_id!: Uuid",
                      author_id as "author_id: Uuid",
                      author_name,
                      author_email,
                      content,
                      is_internal as "is_internal!: bool",
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM task_comments
               WHERE id = $1::uuid"#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| r.into()))
    }

    /// Create a new comment
    pub async fn create(
        pool: &PgPool,
        task_id: Uuid,
        payload: &CreateTaskComment,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        let row = sqlx::query_as!(
            TaskCommentRow,
            r#"INSERT INTO task_comments (id, task_id, author_id, author_name, author_email, content, is_internal, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
               RETURNING id as "id!: Uuid",
                         task_id as "task_id!: Uuid",
                         author_id as "author_id: Uuid",
                         author_name,
                         author_email,
                         content,
                         is_internal as "is_internal!: bool",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            task_id,
            payload.author_id,
            payload.author_name,
            payload.author_email,
            payload.content,
            payload.is_internal
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Update an existing comment
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        payload: &UpdateTaskComment,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let content = payload.content.as_ref().unwrap_or(&existing.content);
        let is_internal = payload.is_internal.unwrap_or(existing.is_internal);

        let row = sqlx::query_as!(
            TaskCommentRow,
            r#"UPDATE task_comments
               SET content = $2, is_internal = $3, updated_at = NOW()
               WHERE id = $1::uuid
               RETURNING id as "id!: Uuid",
                         task_id as "task_id!: Uuid",
                         author_id as "author_id: Uuid",
                         author_name,
                         author_email,
                         content,
                         is_internal as "is_internal!: bool",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            content,
            is_internal
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Delete a comment
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM task_comments WHERE id = $1::uuid", id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected())
    }

    /// Delete all comments for a task
    pub async fn delete_by_task_id(pool: &PgPool, task_id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM task_comments WHERE task_id = $1", task_id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected())
    }
}
