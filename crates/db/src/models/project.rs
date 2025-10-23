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
    pub has_remote: bool,
    pub github_repo_owner: Option<String>,
    pub github_repo_name: Option<String>,
    pub github_repo_id: Option<i64>,

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

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct ProjectRemoteMetadata {
    pub has_remote: bool,
    pub github_repo_owner: Option<String>,
    pub github_repo_name: Option<String>,
    pub github_repo_id: Option<i64>,
}

impl ProjectRemoteMetadata {
    /// Do we need to read from `git remote`
    pub fn needs_git_enrichment(&self) -> bool {
        !self.has_remote || self.github_repo_owner.is_none() || self.github_repo_name.is_none()
    }

    // Do we need to fetch GitHub repo ID
    pub fn needs_repo_id_enrichment(&self) -> bool {
        self.github_repo_id.is_none()
            && self.github_repo_owner.is_some()
            && self.github_repo_name.is_some()
    }
}

impl Project {
    pub async fn count(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar!(r#"SELECT COUNT(*) as "count!: i64" FROM projects"#)
            .fetch_one(pool)
            .await
    }

    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      has_remote as "has_remote!: bool",
                      github_repo_owner,
                      github_repo_name,
                      github_repo_id,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               ORDER BY created_at DESC"#
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
                   p.has_remote as "has_remote!: bool",
                   p.github_repo_owner,
                   p.github_repo_name,
                   p.github_repo_id,
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
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      has_remote as "has_remote!: bool",
                      github_repo_owner,
                      github_repo_name,
                      github_repo_id,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE id = $1"#,
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
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      has_remote as "has_remote!: bool",
                      github_repo_owner,
                      github_repo_name,
                      github_repo_id,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE git_repo_path = $1"#,
            git_repo_path
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_github_repo_id(
        pool: &SqlitePool,
        github_repo_id: i64,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Project,
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      has_remote as "has_remote!: bool",
                      github_repo_owner,
                      github_repo_name,
                      github_repo_id,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE github_repo_id = $1
               LIMIT 1"#,
            github_repo_id
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
            r#"SELECT id as "id!: Uuid",
                      name,
                      git_repo_path,
                      setup_script,
                      dev_script,
                      cleanup_script,
                      copy_files,
                      has_remote as "has_remote!: bool",
                      github_repo_owner,
                      github_repo_name,
                      github_repo_id,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM projects
               WHERE git_repo_path = $1 AND id != $2"#,
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
        remote_metadata: Option<&ProjectRemoteMetadata>,
    ) -> Result<Self, sqlx::Error> {
        let ProjectRemoteMetadata {
            has_remote,
            github_repo_owner,
            github_repo_name,
            github_repo_id,
        } = remote_metadata.cloned().unwrap_or_default();

        sqlx::query_as!(
            Project,
            r#"INSERT INTO projects (
                    id,
                    name,
                    git_repo_path,
                    setup_script,
                    dev_script,
                    cleanup_script,
                    copy_files,
                    has_remote,
                    github_repo_owner,
                    github_repo_name,
                    github_repo_id
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
                )
                RETURNING id as "id!: Uuid",
                          name,
                          git_repo_path,
                          setup_script,
                          dev_script,
                          cleanup_script,
                          copy_files,
                          has_remote as "has_remote!: bool",
                          github_repo_owner,
                          github_repo_name,
                          github_repo_id,
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>""#,
            project_id,
            data.name,
            data.git_repo_path,
            data.setup_script,
            data.dev_script,
            data.cleanup_script,
            data.copy_files,
            has_remote,
            github_repo_owner,
            github_repo_name,
            github_repo_id
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
        remote_metadata: &ProjectRemoteMetadata,
    ) -> Result<Self, sqlx::Error> {
        let ProjectRemoteMetadata {
            has_remote,
            github_repo_owner,
            github_repo_name,
            github_repo_id,
        } = remote_metadata.clone();

        sqlx::query_as!(
            Project,
            r#"UPDATE projects
               SET name = $2,
                   git_repo_path = $3,
                   setup_script = $4,
                   dev_script = $5,
                   cleanup_script = $6,
                   copy_files = $7,
                   has_remote = $8,
                   github_repo_owner = $9,
                   github_repo_name = $10,
                   github_repo_id = $11
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         name,
                         git_repo_path,
                         setup_script,
                         dev_script,
                         cleanup_script,
                         copy_files,
                         has_remote as "has_remote!: bool",
                         github_repo_owner,
                         github_repo_name,
                         github_repo_id,
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            git_repo_path,
            setup_script,
            dev_script,
            cleanup_script,
            copy_files,
            has_remote,
            github_repo_owner,
            github_repo_name,
            github_repo_id
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update_remote_metadata(
        pool: &SqlitePool,
        id: Uuid,
        metadata: &ProjectRemoteMetadata,
    ) -> Result<(), sqlx::Error> {
        let owner = metadata.github_repo_owner.clone();
        let name = metadata.github_repo_name.clone();
        sqlx::query!(
            r#"UPDATE projects
               SET has_remote = $2,
                   github_repo_owner = $3,
                   github_repo_name = $4,
                   github_repo_id = $5
               WHERE id = $1"#,
            id,
            metadata.has_remote,
            owner,
            name,
            metadata.github_repo_id
        )
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM projects WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
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

    pub fn metadata(&self) -> ProjectRemoteMetadata {
        ProjectRemoteMetadata {
            has_remote: self.has_remote,
            github_repo_owner: self.github_repo_owner.clone(),
            github_repo_name: self.github_repo_name.clone(),
            github_repo_id: self.github_repo_id,
        }
    }
}
