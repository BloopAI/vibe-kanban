use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Project {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub color: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
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
    pub async fn find_by_id<'e, E>(executor: E, id: Uuid) -> Result<Option<Project>, ProjectError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            Project,
            r#"
            SELECT
                id               AS "id!: Uuid",
                organization_id  AS "organization_id!: Uuid",
                name             AS "name!",
                color            AS "color!",
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            FROM projects
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }

    pub async fn create<'e, E>(
        executor: E,
        organization_id: Uuid,
        name: String,
        color: String,
    ) -> Result<Project, ProjectError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = Uuid::new_v4();
        let now = Utc::now();
        let record = sqlx::query_as!(
            Project,
            r#"
            INSERT INTO projects (
                id, organization_id, name, color,
                created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id               AS "id!: Uuid",
                organization_id  AS "organization_id!: Uuid",
                name             AS "name!",
                color            AS "color!",
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            "#,
            id,
            organization_id,
            name,
            color,
            now,
            now
        )
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn list_by_organization<'e, E>(
        executor: E,
        organization_id: Uuid,
    ) -> Result<Vec<Project>, ProjectError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let records = sqlx::query_as!(
            Project,
            r#"
            SELECT
                id               AS "id!: Uuid",
                organization_id  AS "organization_id!: Uuid",
                name             AS "name!",
                color            AS "color!",
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            FROM projects
            WHERE organization_id = $1
            ORDER BY created_at DESC
            "#,
            organization_id
        )
        .fetch_all(executor)
        .await?;

        Ok(records)
    }

    pub async fn update<'e, E>(
        executor: E,
        id: Uuid,
        name: String,
        color: String,
    ) -> Result<Project, ProjectError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let updated_at = Utc::now();
        let record = sqlx::query_as!(
            Project,
            r#"
            UPDATE projects
            SET
                name = $1,
                color = $2,
                updated_at = $3
            WHERE id = $4
            RETURNING
                id               AS "id!: Uuid",
                organization_id  AS "organization_id!: Uuid",
                name             AS "name!",
                color            AS "color!",
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            "#,
            name,
            color,
            updated_at,
            id
        )
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<(), ProjectError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query!("DELETE FROM projects WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(())
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
