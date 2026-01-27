use std::path::Path;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
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
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateProjectRepo {
    pub display_name: String,
    pub git_repo_path: String,
}

impl ProjectRepo {
    pub async fn find_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepo,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      repo_id as "repo_id!: Uuid"
               FROM project_repos
               WHERE project_id = $1"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_repo_id(
        pool: &SqlitePool,
        repo_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepo,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      repo_id as "repo_id!: Uuid"
               FROM project_repos
               WHERE repo_id = $1"#,
            repo_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_repos_for_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Repo>, sqlx::Error> {
        sqlx::query_as!(
            Repo,
            r#"SELECT r.id as "id!: Uuid",
                      r.path,
                      r.name,
                      r.display_name,
                      r.setup_script,
                      r.cleanup_script,
                      r.copy_files,
                      r.parallel_setup_script as "parallel_setup_script!: bool",
                      r.dev_server_script,
                      r.default_target_branch,
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
        pool: &SqlitePool,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepo,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      repo_id as "repo_id!: Uuid"
               FROM project_repos
               WHERE project_id = $1 AND repo_id = $2"#,
            project_id,
            repo_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn add_repo_to_project(
        pool: &SqlitePool,
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
        pool: &SqlitePool,
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
        executor: impl sqlx::Executor<'_, Database = sqlx::Sqlite>,
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
                         repo_id as "repo_id!: Uuid""#,
            id,
            project_id,
            repo_id
        )
        .fetch_one(executor)
        .await
    }
}
