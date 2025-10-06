use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Project {
    pub id: Uuid,
    pub organization_id: String,
    pub github_repository_id: i64,
    pub owner: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateProjectData {
    pub id: Uuid,
    pub organization_id: String,
    pub github_repository_id: i64,
    pub owner: String,
    pub name: String,
}

#[derive(Debug)]
pub enum ProjectError {
    Conflict(String),
    Database(sqlx::Error),
}

impl From<sqlx::Error> for ProjectError {
    fn from(error: sqlx::Error) -> Self {
        Self::Database(error)
    }
}

pub struct ProjectRepository;

impl ProjectRepository {
    pub async fn find_by_id(
        tx: &mut Tx<'_>,
        id: Uuid,
        organization_id: &str,
    ) -> Result<Option<Project>, ProjectError> {
        sqlx::query_as!(
            Project,
            r#"
            SELECT
                id AS "id!",
                organization_id AS "organization_id!",
                github_repository_id AS "github_repository_id!",
                owner AS "owner!",
                name AS "name!",
                created_at AS "created_at!",
                updated_at AS "updated_at!"
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

    pub async fn upsert(tx: &mut Tx<'_>, data: CreateProjectData) -> Result<Project, ProjectError> {
        let CreateProjectData {
            id,
            organization_id,
            github_repository_id,
            owner,
            name,
        } = data;

        sqlx::query_as!(
            Project,
            r#"
            INSERT INTO projects (
                id,
                organization_id,
                github_repository_id,
                owner,
                name
            )
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE
            SET github_repository_id = EXCLUDED.github_repository_id,
                owner = EXCLUDED.owner,
                name = EXCLUDED.name,
                organization_id = EXCLUDED.organization_id,
                updated_at = NOW()
            RETURNING
                id AS "id!",
                organization_id AS "organization_id!",
                github_repository_id AS "github_repository_id!",
                owner AS "owner!",
                name AS "name!",
                created_at AS "created_at!",
                updated_at AS "updated_at!"
            "#,
            id,
            organization_id,
            github_repository_id,
            owner,
            name
        )
        .fetch_one(&mut **tx)
        .await
        .map_err(ProjectError::from)
    }
}
