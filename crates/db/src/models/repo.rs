use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
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
    pub setup_script: Option<String>,
    pub cleanup_script: Option<String>,
    pub copy_files: Option<String>,
    pub parallel_setup_script: bool,
    pub dev_server_script: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct UpdateRepo {
    pub display_name: Option<String>,
    pub setup_script: Option<String>,
    pub cleanup_script: Option<String>,
    pub copy_files: Option<String>,
    pub parallel_setup_script: Option<bool>,
    pub dev_server_script: Option<String>,
}

impl Repo {
    /// Get repos that still have the migration sentinel as their name.
    /// Used by the startup backfill to fix repo names.
    pub async fn list_needing_name_fix(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Repo,
            r#"SELECT id as "id!: Uuid",
                      path,
                      name,
                      display_name,
                      setup_script,
                      cleanup_script,
                      copy_files,
                      parallel_setup_script as "parallel_setup_script!: bool",
                      dev_server_script,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM repos
               WHERE name = '__NEEDS_BACKFILL__'"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn update_name(
        pool: &SqlitePool,
        id: Uuid,
        name: &str,
        display_name: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "UPDATE repos SET name = $1, display_name = $2, updated_at = datetime('now', 'subsec') WHERE id = $3",
            name,
            display_name,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Repo,
            r#"SELECT id as "id!: Uuid",
                      path,
                      name,
                      display_name,
                      setup_script,
                      cleanup_script,
                      copy_files,
                      parallel_setup_script as "parallel_setup_script!: bool",
                      dev_server_script,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM repos
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_ids(pool: &SqlitePool, ids: &[Uuid]) -> Result<Vec<Self>, sqlx::Error> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        // Fetch each repo individually since SQLite doesn't support array parameters
        let mut repos = Vec::with_capacity(ids.len());
        for id in ids {
            if let Some(repo) = Self::find_by_id(pool, *id).await? {
                repos.push(repo);
            }
        }
        Ok(repos)
    }

    pub async fn find_or_create<'e, E>(
        executor: E,
        path: &Path,
        display_name: &str,
    ) -> Result<Self, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
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
               ON CONFLICT(path) DO UPDATE SET updated_at = updated_at
               RETURNING id as "id!: Uuid",
                         path,
                         name,
                         display_name,
                         setup_script,
                         cleanup_script,
                         copy_files,
                         parallel_setup_script as "parallel_setup_script!: bool",
                         dev_server_script,
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

    pub async fn delete_orphaned(pool: &SqlitePool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            r#"DELETE FROM repos
               WHERE id NOT IN (SELECT repo_id FROM project_repos)
                 AND id NOT IN (SELECT repo_id FROM workspace_repos)"#
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Repo,
            r#"SELECT id as "id!: Uuid",
                      path,
                      name,
                      display_name,
                      setup_script,
                      cleanup_script,
                      copy_files,
                      parallel_setup_script as "parallel_setup_script!: bool",
                      dev_server_script,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM repos
               ORDER BY display_name ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        payload: &UpdateRepo,
    ) -> Result<Self, RepoError> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(RepoError::NotFound)?;

        let display_name = payload
            .display_name
            .clone()
            .unwrap_or(existing.display_name);
        let setup_script = payload.setup_script.clone();
        let cleanup_script = payload.cleanup_script.clone();
        let copy_files = payload.copy_files.clone();
        let parallel_setup_script = payload
            .parallel_setup_script
            .unwrap_or(existing.parallel_setup_script);
        let dev_server_script = payload.dev_server_script.clone();

        sqlx::query_as!(
            Repo,
            r#"UPDATE repos
               SET display_name = $1,
                   setup_script = $2,
                   cleanup_script = $3,
                   copy_files = $4,
                   parallel_setup_script = $5,
                   dev_server_script = $6,
                   updated_at = datetime('now', 'subsec')
               WHERE id = $7
               RETURNING id as "id!: Uuid",
                         path,
                         name,
                         display_name,
                         setup_script,
                         cleanup_script,
                         copy_files,
                         parallel_setup_script as "parallel_setup_script!: bool",
                         dev_server_script,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            display_name,
            setup_script,
            cleanup_script,
            copy_files,
            parallel_setup_script,
            dev_server_script,
            id
        )
        .fetch_one(pool)
        .await
        .map_err(RepoError::from)
    }
}
