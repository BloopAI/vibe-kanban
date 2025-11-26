use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum ProjectRepositoryError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("Repository not found")]
    NotFound,
    #[error("Cannot delete the last repository in a project")]
    CannotDeleteLastRepository,
    #[error("A repository with this name already exists in the project")]
    NameExists,
    #[error("A repository with this path already exists in the project")]
    PathExists,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct ProjectRepository {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub git_repo_path: PathBuf,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateProjectRepository {
    pub name: String,
    pub git_repo_path: String,
}

impl ProjectRepository {
    /// Find all repositories for a project, sorted alphabetically by name
    pub async fn find_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepository,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      name,
                      git_repo_path,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM project_repositories
               WHERE project_id = $1
               ORDER BY name ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepository,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      name,
                      git_repo_path,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM project_repositories
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_project_and_name(
        pool: &SqlitePool,
        project_id: Uuid,
        name: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepository,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      name,
                      git_repo_path,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM project_repositories
               WHERE project_id = $1 AND name = $2"#,
            project_id,
            name
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_project_and_path(
        pool: &SqlitePool,
        project_id: Uuid,
        git_repo_path: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            ProjectRepository,
            r#"SELECT id as "id!: Uuid",
                      project_id as "project_id!: Uuid",
                      name,
                      git_repo_path,
                      created_at as "created_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM project_repositories
               WHERE project_id = $1 AND git_repo_path = $2"#,
            project_id,
            git_repo_path
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn count_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!: i64" FROM project_repositories WHERE project_id = $1"#,
            project_id
        )
        .fetch_one(pool)
        .await
    }

    pub async fn create(
        executor: impl sqlx::Executor<'_, Database = sqlx::Sqlite>,
        project_id: Uuid,
        data: &CreateProjectRepository,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        sqlx::query_as!(
            ProjectRepository,
            r#"INSERT INTO project_repositories (
                    id,
                    project_id,
                    name,
                    git_repo_path
                ) VALUES (
                    $1, $2, $3, $4
                )
                RETURNING id as "id!: Uuid",
                          project_id as "project_id!: Uuid",
                          name,
                          git_repo_path,
                          created_at as "created_at!: DateTime<Utc>",
                          updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            project_id,
            data.name,
            data.git_repo_path,
        )
        .fetch_one(executor)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM project_repositories WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
