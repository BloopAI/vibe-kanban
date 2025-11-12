use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Project {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub github_repository_id: i64,
    pub owner: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

impl Project {
    pub(crate) fn metadata(&self) -> ProjectMetadata {
        ProjectMetadata {
            github_repository_id: self.github_repository_id,
            owner: self.owner.clone(),
            name: self.name.clone(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateProjectData {
    pub organization_id: Uuid,
    pub metadata: ProjectMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMetadata {
    pub github_repository_id: i64,
    pub owner: String,
    pub name: String,
}

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error("project conflict: {0}")]
    Conflict(String),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct ProjectRepository;

impl ProjectRepository {
    pub async fn find_by_id(
        tx: &mut Tx<'_>,
        id: Uuid,
        organization_id: Uuid,
    ) -> Result<Option<Project>, ProjectError> {
        sqlx::query_as!(
            Project,
            r#"
            SELECT
                id AS "id!",
                organization_id AS "organization_id!: Uuid",
                github_repository_id AS "github_repository_id!",
                owner AS "owner!",
                name AS "name!",
                created_at AS "created_at!"
            FROM projects
            WHERE id = $1
              AND organization_id = $2
            "#,
            id,
            organization_id
        )
        .fetch_optional(&mut **tx)
        .await
        .map_err(ProjectError::from)
    }

    pub async fn find_by_github_repo_id(
        tx: &mut Tx<'_>,
        organization_id: Uuid,
        github_repository_id: i64,
    ) -> Result<Option<Project>, ProjectError> {
        sqlx::query_as!(
            Project,
            r#"
            SELECT
                id AS "id!",
                organization_id AS "organization_id!: Uuid",
                github_repository_id AS "github_repository_id!",
                owner AS "owner!",
                name AS "name!",
                created_at AS "created_at!"
            FROM projects
            WHERE organization_id = $1
              AND github_repository_id = $2
            "#,
            organization_id,
            github_repository_id
        )
        .fetch_optional(&mut **tx)
        .await
        .map_err(ProjectError::from)
    }

    pub async fn insert(tx: &mut Tx<'_>, data: CreateProjectData) -> Result<Project, ProjectError> {
        let CreateProjectData {
            organization_id,
            metadata:
                ProjectMetadata {
                    github_repository_id,
                    owner,
                    name,
                },
        } = data;

        sqlx::query_as!(
            Project,
            r#"
            INSERT INTO projects (
                organization_id,
                github_repository_id,
                owner,
                name
            )
            VALUES ($1, $2, $3, $4)
            RETURNING
                id AS "id!",
                organization_id AS "organization_id!: Uuid",
                github_repository_id AS "github_repository_id!",
                owner AS "owner!",
                name AS "name!",
                created_at AS "created_at!"
            "#,
            organization_id,
            github_repository_id,
            owner,
            name
        )
        .fetch_one(&mut **tx)
        .await
        .map_err(ProjectError::from)
    }

    pub async fn list_by_organization(
        pool: &PgPool,
        organization_id: Uuid,
    ) -> Result<Vec<Project>, ProjectError> {
        sqlx::query_as!(
            Project,
            r#"
            SELECT
                id AS "id!: Uuid",
                organization_id AS "organization_id!: Uuid",
                github_repository_id AS "github_repository_id!",
                owner AS "owner!",
                name AS "name!",
                created_at AS "created_at!"
            FROM projects
            WHERE organization_id = $1
            ORDER BY created_at DESC
            "#,
            organization_id
        )
        .fetch_all(pool)
        .await
        .map_err(ProjectError::from)
    }

    pub async fn fetch_by_id(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Option<Project>, ProjectError> {
        sqlx::query_as!(
            Project,
            r#"
            SELECT
                id AS "id!: Uuid",
                organization_id AS "organization_id!: Uuid",
                github_repository_id AS "github_repository_id!",
                owner AS "owner!",
                name AS "name!",
                created_at AS "created_at!"
            FROM projects
            WHERE id = $1
            "#,
            project_id
        )
        .fetch_optional(pool)
        .await
        .map_err(ProjectError::from)
    }

    pub async fn organization_id(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Option<Uuid>, ProjectError> {
        sqlx::query_scalar!(
            r#"
            SELECT organization_id
            FROM projects
            WHERE id = $1
            "#,
            project_id
        )
        .fetch_optional(pool)
        .await
        .map_err(ProjectError::from)
    }

    pub async fn organization_for_metadata(
        pool: &PgPool,
        user_id: Uuid,
        metadata: &ProjectMetadata,
    ) -> Result<Option<Uuid>, ProjectError> {
        sqlx::query_scalar!(
            r#"
            SELECT p.organization_id
            FROM projects p
            JOIN organization_member_metadata m
              ON m.organization_id = p.organization_id
            WHERE p.github_repository_id = $1
              AND p.owner = $2
              AND p.name = $3
              AND m.user_id = $4
              AND m.status = 'active'
            ORDER BY p.created_at ASC
            LIMIT 1
            "#,
            metadata.github_repository_id,
            metadata.owner,
            metadata.name,
            user_id
        )
        .fetch_optional(pool)
        .await
        .map_err(ProjectError::from)
    }
}
