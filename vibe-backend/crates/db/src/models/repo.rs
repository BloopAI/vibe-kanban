use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, PgPool, Postgres};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum RepoError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Repository not found")]
    NotFound,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Repo {
    pub id: Uuid,
    pub path: PathBuf,
    pub name: String,
    pub display_name: String,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

impl Repo {
    /// Get repos that still have the migration sentinel as their name.
    /// Used by the startup backfill to fix repo names.
    pub async fn list_needing_name_fix(pool: &PgPool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Repo,
            r#"SELECT id as "id!: Uuid",
                      path,
                      name,
                      display_name,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM repos
               WHERE name = '__NEEDS_BACKFILL__'"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn update_name(
        pool: &PgPool,
        id: Uuid,
        name: &str,
        display_name: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE repos SET name = $1, display_name = $2, updated_at = NOW() WHERE id = $3",
            name,
            display_name,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Repo,
            r#"SELECT id as "id!: Uuid",
                      path,
                      name,
                      display_name,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM repos
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_or_create<'e, E>(
        executor: E,
        path: &Path,
        display_name: &str,
    ) -> Result<Self, sqlx::Error>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let path_str = path.to_string_lossy().to_string();
        let id = Uuid::new_v4();
        let repo_name = path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| id.to_string());

        // Use INSERT OR IGNORE + SELECT to handle race conditions atomically
        sqlx::query_as!(
            Repo,
            r#"INSERT INTO repos (id, path, name, display_name)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT(path) DO UPDATE SET updated_at = repos.updated_at
               RETURNING id as "id!: Uuid",
                         path,
                         name,
                         display_name,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            path_str,
            repo_name,
            display_name,
        )
        .fetch_one(executor)
        .await
    }

    pub async fn delete_orphaned(pool: &PgPool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            r#"DELETE FROM repos
               WHERE id NOT IN (SELECT repo_id FROM project_repos)
                 AND id NOT IN (SELECT repo_id FROM workspace_repos)"#
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}
