use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum ExternalSessionError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("External session not found")]
    NotFound,
    #[error("Invalid status: {0}")]
    InvalidStatus(String),
}

/// An agent session registered from outside VK
/// (terminal Claude Code, Gemini CLI, Zora task, etc.)
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct ExternalSession {
    pub id: Uuid,
    pub name: Option<String>,
    /// "claude_code" | "gemini" | "zora" | "unknown"
    pub runtime: String,
    pub project_path: Option<String>,
    pub branch: Option<String>,
    pub pid: Option<i64>,
    /// "in_progress" | "in_review" | "done" | "blocked"
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateExternalSession {
    pub name: Option<String>,
    pub runtime: Option<String>,
    pub project_path: Option<String>,
    pub branch: Option<String>,
    pub pid: Option<i64>,
}

const VALID_STATUSES: &[&str] = &["in_progress", "in_review", "done", "blocked"];

impl ExternalSession {
    pub async fn find_by_id(
        pool: &SqlitePool,
        id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExternalSession,
            r#"SELECT id AS "id!: Uuid",
                      name,
                      runtime,
                      project_path,
                      branch,
                      pid,
                      status,
                      created_at AS "created_at!: DateTime<Utc>",
                      updated_at AS "updated_at!: DateTime<Utc>"
               FROM external_sessions
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ExternalSession,
            r#"SELECT id AS "id!: Uuid",
                      name,
                      runtime,
                      project_path,
                      branch,
                      pid,
                      status,
                      created_at AS "created_at!: DateTime<Utc>",
                      updated_at AS "updated_at!: DateTime<Utc>"
               FROM external_sessions
               ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateExternalSession,
    ) -> Result<Self, ExternalSessionError> {
        let id = Uuid::new_v4();
        let runtime = data.runtime.as_deref().unwrap_or("unknown");
        let name = data.name.as_deref().filter(|s| !s.is_empty());

        Ok(sqlx::query_as!(
            ExternalSession,
            r#"INSERT INTO external_sessions
                   (id, name, runtime, project_path, branch, pid)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id AS "id!: Uuid",
                         name,
                         runtime,
                         project_path,
                         branch,
                         pid,
                         status,
                         created_at AS "created_at!: DateTime<Utc>",
                         updated_at AS "updated_at!: DateTime<Utc>""#,
            id,
            name,
            runtime,
            data.project_path,
            data.branch,
            data.pid,
        )
        .fetch_one(pool)
        .await?)
    }

    pub async fn update_status(
        pool: &SqlitePool,
        id: Uuid,
        status: &str,
    ) -> Result<Self, ExternalSessionError> {
        if !VALID_STATUSES.contains(&status) {
            return Err(ExternalSessionError::InvalidStatus(status.to_string()));
        }

        let updated = sqlx::query_as!(
            ExternalSession,
            r#"UPDATE external_sessions
               SET status = $1, updated_at = datetime('now', 'subsec')
               WHERE id = $2
               RETURNING id AS "id!: Uuid",
                         name,
                         runtime,
                         project_path,
                         branch,
                         pid,
                         status,
                         created_at AS "created_at!: DateTime<Utc>",
                         updated_at AS "updated_at!: DateTime<Utc>""#,
            status,
            id,
        )
        .fetch_optional(pool)
        .await?
        .ok_or(ExternalSessionError::NotFound)?;

        Ok(updated)
    }
}
