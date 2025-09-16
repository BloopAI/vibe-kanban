use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Project not found")]
    ProjectNotFound,
    #[error("Project with git repository path already exists")]
    GitRepoPathExists,
    #[error("Failed to check existing git repository path: {0}")]
    GitRepoCheckFailed(String),
    #[error("Failed to create project: {0}")]
    CreateFailed(String),
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub git_repo_path: PathBuf,
    pub setup_script: Option<String>,
    pub dev_script: Option<String>,
    pub cleanup_script: Option<String>,
    pub copy_files: Option<String>,
    pub github_issues_sync_enabled: bool,
    pub github_issues_create_on_new_tasks: bool,
    #[ts(type = "Date | null")]
    pub github_issues_last_sync_at: Option<DateTime<Utc>>,

    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateProject {
    pub name: String,
    pub git_repo_path: String,
    pub use_existing_repo: bool,
    pub setup_script: Option<String>,
    pub dev_script: Option<String>,
    pub cleanup_script: Option<String>,
    pub copy_files: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateProject {
    pub name: Option<String>,
    pub git_repo_path: Option<String>,
    pub setup_script: Option<String>,
    pub dev_script: Option<String>,
    pub cleanup_script: Option<String>,
    pub copy_files: Option<String>,
    pub github_issues_sync_enabled: Option<bool>,
    pub github_issues_create_on_new_tasks: Option<bool>,
}

#[derive(Debug, Serialize, TS)]
pub struct SearchResult {
    pub path: String,
    pub is_file: bool,
    pub match_type: SearchMatchType,
}

#[derive(Debug, Clone, Serialize, TS)]
pub enum SearchMatchType {
    FileName,
    DirectoryName,
    FullPath,
}

impl Project {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid", name, git_repo_path, setup_script, dev_script, cleanup_script, copy_files,
                       github_issues_sync_enabled as "github_issues_sync_enabled!: bool",
                       github_issues_create_on_new_tasks as "github_issues_create_on_new_tasks!: bool",
                       github_issues_last_sync_at as "github_issues_last_sync_at?: DateTime<Utc>",
                       created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM projects ORDER BY created_at DESC"#
        )
        .fetch_all(pool)
        .await
    }

    /// Find the most actively used projects based on recent task activity
    pub async fn find_most_active(pool: &SqlitePool, limit: i32) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"
            SELECT p.id as "id!: Uuid", p.name, p.git_repo_path, p.setup_script, p.dev_script, p.cleanup_script, p.copy_files, 
                   p.github_issues_sync_enabled as "github_issues_sync_enabled!: bool",
                   p.github_issues_create_on_new_tasks as "github_issues_create_on_new_tasks!: bool",
                   p.github_issues_last_sync_at as "github_issues_last_sync_at?: DateTime<Utc>",
                   p.created_at as "created_at!: DateTime<Utc>", p.updated_at as "updated_at!: DateTime<Utc>"
            FROM projects p
            WHERE p.id IN (
                SELECT DISTINCT t.project_id
                FROM tasks t
                INNER JOIN task_attempts ta ON ta.task_id = t.id
                ORDER BY ta.updated_at DESC
            )
            LIMIT $1
            "#,
            limit
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid", name, git_repo_path, setup_script, dev_script, cleanup_script, copy_files,
                      github_issues_sync_enabled as "github_issues_sync_enabled!: bool",
                      github_issues_create_on_new_tasks as "github_issues_create_on_new_tasks!: bool",
                      github_issues_last_sync_at as "github_issues_last_sync_at?: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM projects WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_git_repo_path(
        pool: &SqlitePool,
        git_repo_path: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid", name, git_repo_path, setup_script, dev_script, cleanup_script, copy_files,
                      github_issues_sync_enabled as "github_issues_sync_enabled!: bool",
                      github_issues_create_on_new_tasks as "github_issues_create_on_new_tasks!: bool",
                      github_issues_last_sync_at as "github_issues_last_sync_at?: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM projects WHERE git_repo_path = $1"#,
            git_repo_path
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_git_repo_path_excluding_id(
        pool: &SqlitePool,
        git_repo_path: &str,
        exclude_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid", name, git_repo_path, setup_script, dev_script, cleanup_script, copy_files,
                      github_issues_sync_enabled as "github_issues_sync_enabled!: bool",
                      github_issues_create_on_new_tasks as "github_issues_create_on_new_tasks!: bool",
                      github_issues_last_sync_at as "github_issues_last_sync_at?: DateTime<Utc>",
                      created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM projects WHERE git_repo_path = $1 AND id != $2"#,
            git_repo_path,
            exclude_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateProject,
        project_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"INSERT INTO projects (id, name, git_repo_path, setup_script, dev_script, cleanup_script, copy_files)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id as "id!: Uuid", name, git_repo_path, setup_script, dev_script, cleanup_script, copy_files,
                         github_issues_sync_enabled as "github_issues_sync_enabled!: bool",
                         github_issues_create_on_new_tasks as "github_issues_create_on_new_tasks!: bool",
                         github_issues_last_sync_at as "github_issues_last_sync_at?: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            project_id,
            data.name,
            data.git_repo_path,
            data.setup_script,
            data.dev_script,
            data.cleanup_script,
            data.copy_files
        )
        .fetch_one(pool)
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        name: String,
        git_repo_path: String,
        setup_script: Option<String>,
        dev_script: Option<String>,
        cleanup_script: Option<String>,
        copy_files: Option<String>,
        github_issues_sync_enabled: bool,
        github_issues_create_on_new_tasks: bool,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"UPDATE projects SET name = $2, git_repo_path = $3, setup_script = $4, dev_script = $5, cleanup_script = $6, copy_files = $7,
                         github_issues_sync_enabled = $8,
                         github_issues_create_on_new_tasks = $9
               WHERE id = $1
               RETURNING id as "id!: Uuid", name, git_repo_path, setup_script, dev_script, cleanup_script, copy_files,
                         github_issues_sync_enabled as "github_issues_sync_enabled!: bool",
                         github_issues_create_on_new_tasks as "github_issues_create_on_new_tasks!: bool",
                         github_issues_last_sync_at as "github_issues_last_sync_at?: DateTime<Utc>",
                         created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            git_repo_path,
            setup_script,
            dev_script,
            cleanup_script,
            copy_files,
            github_issues_sync_enabled,
            github_issues_create_on_new_tasks
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM projects WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn update_github_issues_last_sync(
        pool: &SqlitePool,
        id: Uuid,
        at: DateTime<Utc>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"UPDATE projects SET github_issues_last_sync_at = $2 WHERE id = $1"#,
            id,
            at
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn clear_github_issues_last_sync(
        pool: &SqlitePool,
        id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE projects SET github_issues_last_sync_at = NULL WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn exists(pool: &SqlitePool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            r#"
                SELECT COUNT(*) as "count!: i64"
                FROM projects
                WHERE id = $1
            "#,
            id
        )
        .fetch_one(pool)
        .await?;

        Ok(result.count > 0)
    }
}
