use std::path::Path;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::repo::Repo;

#[derive(Debug, Error)]
pub enum ProjectRepoError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Repository not found")]
    NotFound,
    #[error("Repository already exists in this project")]
    AlreadyExists,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct ProjectRepo {
    pub id: Uuid,
    pub project_id: Uuid,
    pub repo_id: Uuid,
    pub setup_script: Option<String>,
    pub cleanup_script: Option<String>,
    pub copy_files: Option<String>,
    pub parallel_setup_script: bool,
}

/// ProjectRepo with the associated repo name (for script execution in worktrees)
#[derive(Debug, Clone, FromRow)]
pub struct ProjectRepoWithName {
    pub id: Uuid,
    pub project_id: Uuid,
    pub repo_id: Uuid,
    pub repo_name: String,
    pub setup_script: Option<String>,
    pub cleanup_script: Option<String>,
    pub copy_files: Option<String>,
    pub parallel_setup_script: bool,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateProjectRepo {
    pub display_name: String,
    pub git_repo_path: String,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct UpdateProjectRepo {
    pub setup_script: Option<String>,
    pub cleanup_script: Option<String>,
    pub copy_files: Option<String>,
    pub parallel_setup_script: Option<bool>,
}

impl ProjectRepo {
    pub async fn find_by_project_id(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepo,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      repo_id as "repo_id!: Uuid",
                      setup_script,
                      cleanup_script,
                      copy_files,
                      parallel_setup_script as "parallel_setup_script!: bool"
               FROM project_repos
               WHERE project_id = $1"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_repo_id(
        pool: &PgPool,
        repo_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepo,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      repo_id as "repo_id!: Uuid",
                      setup_script,
                      cleanup_script,
                      copy_files,
                      parallel_setup_script as "parallel_setup_script!: bool"
               FROM project_repos
               WHERE repo_id = $1"#,
            repo_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_project_id_with_names(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Vec<ProjectRepoWithName>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepoWithName,
            r#"SELECT pr.id as "id!: Uuid",
                      pr.project_id as "project_id!: Uuid",
                      pr.repo_id as "repo_id!: Uuid",
                      r.name as "repo_name!",
                      pr.setup_script,
                      pr.cleanup_script,
                      pr.copy_files,
                      pr.parallel_setup_script as "parallel_setup_script!: bool"
               FROM project_repos pr
               JOIN repos r ON r.id = pr.repo_id
               WHERE pr.project_id = $1
               ORDER BY r.display_name ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_repos_for_project(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Vec<Repo>, sqlx::Error> {
        sqlx::query_as!(
            Repo,
            r#"SELECT r.id as "id!: Uuid",
                      r.path,
                      r.name,
                      r.display_name, 
                      r.created_at as "created_at!: DateTime<Utc>",
                      r.updated_at as "updated_at!: DateTime<Utc>"
               FROM repos r
               JOIN project_repos pr ON r.id = pr.repo_id
               WHERE pr.project_id = $1
               ORDER BY r.display_name ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_project_and_repo(
        pool: &PgPool,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepo,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      repo_id as "repo_id!: Uuid",
                      setup_script,
                      cleanup_script,
                      copy_files,
                      parallel_setup_script as "parallel_setup_script!: bool"
               FROM project_repos
               WHERE project_id = $1 AND repo_id = $2"#,
            project_id,
            repo_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn add_repo_to_project(
        pool: &PgPool,
        project_id: Uuid,
        repo_path: &str,
        repo_name: &str,
    ) -> Result<Repo, ProjectRepoError> {
        let repo = Repo::find_or_create(pool, Path::new(repo_path), repo_name).await?;

        if Self::find_by_project_and_repo(pool, project_id, repo.id)
            .await?
            .is_some()
        {
            return Err(ProjectRepoError::AlreadyExists);
        }

        let id = Uuid::new_v4();
        sqlx::query!(
            r#"INSERT INTO project_repos (id, project_id, repo_id)
               VALUES ($1, $2, $3)"#,
            id,
            project_id,
            repo.id
        )
        .execute(pool)
        .await?;

        Ok(repo)
    }

    pub async fn remove_repo_from_project(
        pool: &PgPool,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<(), ProjectRepoError> {
        let result = sqlx::query!(
            "DELETE FROM project_repos WHERE project_id = $1 AND repo_id = $2",
            project_id,
            repo_id
        )
        .execute(pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(ProjectRepoError::NotFound);
        }

        Ok(())
    }

    pub async fn create(
        executor: impl sqlx::Executor<'_, Database = sqlx::Postgres>,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            ProjectRepo,
            r#"INSERT INTO project_repos (id, project_id, repo_id)
               VALUES ($1, $2, $3)
               RETURNING id as "id!: Uuid",
                         project_id as "project_id!: Uuid",
                         repo_id as "repo_id!: Uuid",
                         setup_script,
                         cleanup_script,
                         copy_files,
                         parallel_setup_script as "parallel_setup_script!: bool""#,
            id,
            project_id,
            repo_id
        )
        .fetch_one(executor)
        .await
    }

    pub async fn update(
        pool: &PgPool,
        project_id: Uuid,
        repo_id: Uuid,
        payload: &UpdateProjectRepo,
    ) -> Result<Self, ProjectRepoError> {
        let existing = Self::find_by_project_and_repo(pool, project_id, repo_id).await?;
        let existing = existing.ok_or(ProjectRepoError::NotFound)?;

        let setup_script = payload.setup_script.clone();
        let cleanup_script = payload.cleanup_script.clone();
        let copy_files = payload.copy_files.clone();
        let parallel_setup_script = payload
            .parallel_setup_script
            .unwrap_or(existing.parallel_setup_script);

        sqlx::query_as!(
            ProjectRepo,
            r#"UPDATE project_repos
               SET setup_script = $1,
                   cleanup_script = $2,
                   copy_files = $3,
                   parallel_setup_script = $4
               WHERE project_id = $5 AND repo_id = $6
               RETURNING id as "id!: Uuid",
                         project_id as "project_id!: Uuid",
                         repo_id as "repo_id!: Uuid",
                         setup_script,
                         cleanup_script,
                         copy_files,
                         parallel_setup_script as "parallel_setup_script!: bool""#,
            setup_script,
            cleanup_script,
            copy_files,
            parallel_setup_script,
            project_id,
            repo_id
        )
        .fetch_one(pool)
        .await
        .map_err(ProjectRepoError::from)
    }
}
