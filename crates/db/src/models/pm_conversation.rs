use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum PmConversationError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("PM conversation not found")]
    NotFound,
}

/// Role of the message in PM conversation
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PmMessageRole {
    User,
    Assistant,
    System,
}

impl std::fmt::Display for PmMessageRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PmMessageRole::User => write!(f, "user"),
            PmMessageRole::Assistant => write!(f, "assistant"),
            PmMessageRole::System => write!(f, "system"),
        }
    }
}

impl std::str::FromStr for PmMessageRole {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "user" => Ok(PmMessageRole::User),
            "assistant" => Ok(PmMessageRole::Assistant),
            "system" => Ok(PmMessageRole::System),
            _ => Err(format!("Invalid role: {}", s)),
        }
    }
}

/// A message in the PM conversation
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct PmConversation {
    pub id: Uuid,
    pub project_id: Uuid,
    pub role: String, // Stored as string in DB, use PmMessageRole for type safety
    pub content: String,
    pub model: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

/// Data for creating a new PM conversation message
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreatePmConversation {
    pub project_id: Uuid,
    pub role: PmMessageRole,
    pub content: String,
    pub model: Option<String>,
}

/// File attachment for PM conversation
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct PmAttachment {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub project_id: Uuid,
    pub file_name: String,
    pub file_path: String,
    pub mime_type: String,
    pub file_size: i64,
    pub sha256: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

/// Data for creating a new PM attachment
#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreatePmAttachment {
    pub conversation_id: Uuid,
    pub project_id: Uuid,
    pub file_name: String,
    pub file_path: String,
    pub mime_type: String,
    pub file_size: i64,
    pub sha256: Option<String>,
}

impl PmConversation {
    /// Find all messages for a project, ordered by creation time
    pub async fn find_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            PmConversation,
            r#"SELECT
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                role,
                content,
                model,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM pm_conversations
            WHERE project_id = $1
            ORDER BY created_at ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find a specific message by ID
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            PmConversation,
            r#"SELECT
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                role,
                content,
                model,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>"
            FROM pm_conversations
            WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Create a new PM conversation message
    pub async fn create(
        executor: impl Executor<'_, Database = Sqlite>,
        data: &CreatePmConversation,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let role = data.role.to_string();

        sqlx::query_as!(
            PmConversation,
            r#"INSERT INTO pm_conversations (
                id, project_id, role, content, model
            ) VALUES (
                $1, $2, $3, $4, $5
            )
            RETURNING
                id as "id!: Uuid",
                project_id as "project_id!: Uuid",
                role,
                content,
                model,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.project_id,
            role,
            data.content,
            data.model,
        )
        .fetch_one(executor)
        .await
    }

    /// Delete a message by ID
    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM pm_conversations WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Delete all messages for a project
    pub async fn delete_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM pm_conversations WHERE project_id = $1",
            project_id
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Get message count for a project
    pub async fn count_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!: i64" FROM pm_conversations WHERE project_id = $1"#,
            project_id
        )
        .fetch_one(pool)
        .await
    }
}

impl PmAttachment {
    /// Find all attachments for a conversation
    pub async fn find_by_conversation_id(
        pool: &SqlitePool,
        conversation_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            PmAttachment,
            r#"SELECT
                id as "id!: Uuid",
                conversation_id as "conversation_id!: Uuid",
                project_id as "project_id!: Uuid",
                file_name,
                file_path,
                mime_type,
                file_size,
                sha256,
                created_at as "created_at!: DateTime<Utc>"
            FROM pm_attachments
            WHERE conversation_id = $1
            ORDER BY created_at ASC"#,
            conversation_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find all attachments for a project
    pub async fn find_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            PmAttachment,
            r#"SELECT
                id as "id!: Uuid",
                conversation_id as "conversation_id!: Uuid",
                project_id as "project_id!: Uuid",
                file_name,
                file_path,
                mime_type,
                file_size,
                sha256,
                created_at as "created_at!: DateTime<Utc>"
            FROM pm_attachments
            WHERE project_id = $1
            ORDER BY created_at ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find a specific attachment by ID
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            PmAttachment,
            r#"SELECT
                id as "id!: Uuid",
                conversation_id as "conversation_id!: Uuid",
                project_id as "project_id!: Uuid",
                file_name,
                file_path,
                mime_type,
                file_size,
                sha256,
                created_at as "created_at!: DateTime<Utc>"
            FROM pm_attachments
            WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Create a new attachment
    pub async fn create(
        executor: impl Executor<'_, Database = Sqlite>,
        data: &CreatePmAttachment,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        sqlx::query_as!(
            PmAttachment,
            r#"INSERT INTO pm_attachments (
                id, conversation_id, project_id, file_name, file_path, mime_type, file_size, sha256
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8
            )
            RETURNING
                id as "id!: Uuid",
                conversation_id as "conversation_id!: Uuid",
                project_id as "project_id!: Uuid",
                file_name,
                file_path,
                mime_type,
                file_size,
                sha256,
                created_at as "created_at!: DateTime<Utc>""#,
            id,
            data.conversation_id,
            data.project_id,
            data.file_name,
            data.file_path,
            data.mime_type,
            data.file_size,
            data.sha256,
        )
        .fetch_one(executor)
        .await
    }

    /// Delete an attachment by ID
    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM pm_attachments WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
