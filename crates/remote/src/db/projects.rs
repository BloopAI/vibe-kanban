use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Executor, Postgres};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub metadata: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProjectData {
    pub organization_id: Uuid,
    pub name: String,
    pub metadata: Value,
}

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error("project conflict: {0}")]
    Conflict(String),
    #[error("invalid project metadata")]
    InvalidMetadata,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct ProjectRepository;

impl ProjectRepository {
    pub async fn find_by_id<'e, E>(executor: E, id: Uuid) -> Result<Option<Project>, ProjectError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query!(
            r#"
            SELECT
                id               AS "id!: Uuid",
                organization_id  AS "organization_id!: Uuid",
                name             AS "name!",
                metadata         AS "metadata!: Value",
                created_at       AS "created_at!: DateTime<Utc>"
            FROM projects
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record.map(|row| Project {
            id: row.id,
            organization_id: row.organization_id,
            name: row.name,
            metadata: row.metadata,
            created_at: row.created_at,
        }))
    }

    pub async fn create<'e, E>(
        executor: E,
        data: CreateProjectData,
    ) -> Result<Project, ProjectError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let CreateProjectData {
            organization_id,
            name,
            metadata,
        } = data;

        let metadata = if metadata.is_null() {
            Value::Object(serde_json::Map::new())
        } else if !metadata.is_object() {
            return Err(ProjectError::InvalidMetadata);
        } else {
            metadata
        };

        let record = sqlx::query!(
            r#"
            INSERT INTO projects (
                organization_id,
                name,
                metadata
            )
            VALUES ($1, $2, $3)
            RETURNING
                id               AS "id!: Uuid",
                organization_id  AS "organization_id!: Uuid",
                name             AS "name!",
                metadata         AS "metadata!: Value",
                created_at       AS "created_at!: DateTime<Utc>"
            "#,
            organization_id,
            name,
            metadata
        )
        .fetch_one(executor)
        .await
        .map_err(ProjectError::from)?;

        Ok(Project {
            id: record.id,
            organization_id: record.organization_id,
            name: record.name,
            metadata: record.metadata,
            created_at: record.created_at,
        })
    }

    pub async fn list_by_organization<'e, E>(
        executor: E,
        organization_id: Uuid,
    ) -> Result<Vec<Project>, ProjectError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let rows = sqlx::query!(
            r#"
            SELECT
                id               AS "id!: Uuid",
                organization_id  AS "organization_id!: Uuid",
                name             AS "name!",
                metadata         AS "metadata!: Value",
                created_at       AS "created_at!: DateTime<Utc>"
            FROM projects
            WHERE organization_id = $1
            ORDER BY created_at DESC
            "#,
            organization_id
        )
        .fetch_all(executor)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| Project {
                id: row.id,
                organization_id: row.organization_id,
                name: row.name,
                metadata: row.metadata,
                created_at: row.created_at,
            })
            .collect())
    }

    pub async fn organization_id<'e, E>(
        executor: E,
        project_id: Uuid,
    ) -> Result<Option<Uuid>, ProjectError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query_scalar!(
            r#"
            SELECT organization_id
            FROM projects
            WHERE id = $1
            "#,
            project_id
        )
        .fetch_optional(executor)
        .await
        .map_err(ProjectError::from)
    }
}
