use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_with::rust::double_option;
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
    pub archive_script: Option<String>,
    pub copy_files: Option<String>,
    pub parallel_setup_script: bool,
    pub dev_server_script: Option<String>,
    pub default_target_branch: Option<String>,
    pub default_working_dir: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateRepo {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "double_option"
    )]
    #[ts(optional, type = "string | null")]
    pub display_name: Option<Option<String>>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "double_option"
    )]
    #[ts(optional, type = "string | null")]
    pub setup_script: Option<Option<String>>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "double_option"
    )]
    #[ts(optional, type = "string | null")]
    pub cleanup_script: Option<Option<String>>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "double_option"
    )]
    #[ts(optional, type = "string | null")]
    pub archive_script: Option<Option<String>>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "double_option"
    )]
    #[ts(optional, type = "string | null")]
    pub copy_files: Option<Option<String>>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "double_option"
    )]
    #[ts(optional, type = "boolean | null")]
    pub parallel_setup_script: Option<Option<bool>>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "double_option"
    )]
    #[ts(optional, type = "string | null")]
    pub dev_server_script: Option<Option<String>>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "double_option"
    )]
    #[ts(optional, type = "string | null")]
    pub default_target_branch: Option<Option<String>>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "double_option"
    )]
    #[ts(optional, type = "string | null")]
    pub default_working_dir: Option<Option<String>>,
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
                      archive_script,
                      copy_files,
                      parallel_setup_script as "parallel_setup_script!: bool",
                      dev_server_script,
                      default_target_branch,
                      default_working_dir,
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
                      archive_script,
                      copy_files,
                      parallel_setup_script as "parallel_setup_script!: bool",
                      dev_server_script,
                      default_target_branch,
                      default_working_dir,
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
                         archive_script,
                         copy_files,
                         parallel_setup_script as "parallel_setup_script!: bool",
                         dev_server_script,
                         default_target_branch,
                         default_working_dir,
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
                      archive_script,
                      copy_files,
                      parallel_setup_script as "parallel_setup_script!: bool",
                      dev_server_script,
                      default_target_branch,
                      default_working_dir,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM repos
               ORDER BY display_name ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn list_by_recent_workspace_usage(
        pool: &SqlitePool,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Repo,
            r#"SELECT r.id as "id!: Uuid",
                      r.path,
                      r.name,
                      r.display_name,
                      r.setup_script,
                      r.cleanup_script,
                      r.archive_script,
                      r.copy_files,
                      r.parallel_setup_script as "parallel_setup_script!: bool",
                      r.dev_server_script,
                      r.default_target_branch,
                      r.default_working_dir,
                      r.created_at as "created_at!: DateTime<Utc>",
                      r.updated_at as "updated_at!: DateTime<Utc>"
               FROM repos r
               LEFT JOIN (
                   SELECT repo_id, MAX(updated_at) AS last_used_at
                   FROM workspace_repos
                   GROUP BY repo_id
               ) wr ON wr.repo_id = r.id
               ORDER BY wr.last_used_at DESC, r.display_name ASC"#
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

        // None = don't update (use existing)
        // Some(None) = set to NULL
        // Some(Some(v)) = set to v
        let display_name = match &payload.display_name {
            None => existing.display_name,
            Some(v) => v.clone().unwrap_or_default(),
        };
        let setup_script = match &payload.setup_script {
            None => existing.setup_script,
            Some(v) => v.clone(),
        };
        let cleanup_script = match &payload.cleanup_script {
            None => existing.cleanup_script,
            Some(v) => v.clone(),
        };
        let archive_script = match &payload.archive_script {
            None => existing.archive_script,
            Some(v) => v.clone(),
        };
        let copy_files = match &payload.copy_files {
            None => existing.copy_files,
            Some(v) => v.clone(),
        };
        let parallel_setup_script = match &payload.parallel_setup_script {
            None => existing.parallel_setup_script,
            Some(v) => v.unwrap_or(false),
        };
        let dev_server_script = match &payload.dev_server_script {
            None => existing.dev_server_script,
            Some(v) => v.clone(),
        };
        let default_target_branch = match &payload.default_target_branch {
            None => existing.default_target_branch,
            Some(v) => v.clone(),
        };
        let default_working_dir = match &payload.default_working_dir {
            None => existing.default_working_dir,
            Some(v) => v.clone(),
        };

        sqlx::query_as!(
            Repo,
            r#"UPDATE repos
               SET display_name = $1,
                   setup_script = $2,
                   cleanup_script = $3,
                   archive_script = $4,
                   copy_files = $5,
                   parallel_setup_script = $6,
                   dev_server_script = $7,
                   default_target_branch = $8,
                   default_working_dir = $9,
                   updated_at = datetime('now', 'subsec')
               WHERE id = $10
               RETURNING id as "id!: Uuid",
                         path,
                         name,
                         display_name,
                         setup_script,
                         cleanup_script,
                         archive_script,
                         copy_files,
                         parallel_setup_script as "parallel_setup_script!: bool",
                         dev_server_script,
                         default_target_branch,
                         default_working_dir,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            display_name,
            setup_script,
            cleanup_script,
            archive_script,
            copy_files,
            parallel_setup_script,
            dev_server_script,
            default_target_branch,
            default_working_dir,
            id
        )
        .fetch_one(pool)
        .await
        .map_err(RepoError::from)
    }
}
