use chrono::{DateTime, Utc};
use sqlx::{Executor, PgPool, Postgres};
use thiserror::Error;
use api_types::Project;
use uuid::Uuid;

use super::{get_txid, project_statuses::ProjectStatusRepository, tags::TagRepository};
use api_types::{DeleteResponse, MutationResponse};

/// Default color for the initial project created with personal organizations
/// HSL format: "H S% L%" (blue - matches "To do" status)
pub const INITIAL_PROJECT_COLOR: &str = "217 91% 60%";

/// Default name for the initial project
pub const INITIAL_PROJECT_NAME: &str = "Initial Project";

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error("project conflict: {0}")]
    Conflict(String),
    #[error("failed to create default tags: {0}")]
    DefaultTagsFailed(String),
    #[error("failed to create default statuses: {0}")]
    DefaultStatusesFailed(String),
    #[error("database error: {0}")]
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
                sort_order       AS "sort_order!",
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
        id: Option<Uuid>,
        organization_id: Uuid,
        name: String,
        color: String,
    ) -> Result<Project, ProjectError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = id.unwrap_or_else(Uuid::new_v4);
        let now = Utc::now();
        let record = sqlx::query_as!(
            Project,
            r#"
            INSERT INTO projects (
                id, organization_id, name, color, sort_order,
                created_at, updated_at
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                COALESCE(
                    (SELECT MAX(sort_order) + 1 FROM projects WHERE organization_id = $2),
                    0
                ),
                $5,
                $6
            )
            RETURNING
                id               AS "id!: Uuid",
                organization_id  AS "organization_id!: Uuid",
                name             AS "name!",
                color            AS "color!",
                sort_order       AS "sort_order!",
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
                sort_order       AS "sort_order!",
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            FROM projects
            WHERE organization_id = $1
            ORDER BY sort_order ASC, created_at DESC
            "#,
            organization_id
        )
        .fetch_all(executor)
        .await?;

        Ok(records)
    }

    /// Update a project with partial fields. Uses COALESCE to preserve existing values
    /// when None is provided.
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        name: Option<String>,
        color: Option<String>,
        sort_order: Option<i32>,
    ) -> Result<MutationResponse<Project>, ProjectError> {
        let mut tx = pool.begin().await?;
        let data = Self::update_partial(&mut *tx, id, name, color, sort_order).await?;

        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;
        Ok(MutationResponse { data, txid })
    }

    /// Updates project fields using a provided executor (used by bulk update transactions).
    pub async fn update_partial<'e, E>(
        executor: E,
        id: Uuid,
        name: Option<String>,
        color: Option<String>,
        sort_order: Option<i32>,
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
                name = COALESCE($1, name),
                color = COALESCE($2, color),
                sort_order = COALESCE($3, sort_order),
                updated_at = $4
            WHERE id = $5
            RETURNING
                id               AS "id!: Uuid",
                organization_id  AS "organization_id!: Uuid",
                name             AS "name!",
                color            AS "color!",
                sort_order       AS "sort_order!",
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            "#,
            name,
            color,
            sort_order,
            updated_at,
            id
        )
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<DeleteResponse, ProjectError> {
        let mut tx = pool.begin().await?;
        sqlx::query!("DELETE FROM projects WHERE id = $1", id)
            .execute(&mut *tx)
            .await?;
        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;
        Ok(DeleteResponse { txid })
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

    /// Creates the initial project for a newly created personal organization.
    /// Includes default tags and statuses. Designed for use within transactions.
    pub async fn create_initial_project_tx(
        tx: &mut sqlx::Transaction<'_, Postgres>,
        organization_id: Uuid,
    ) -> Result<Project, ProjectError> {
        let project = Self::create(
            &mut **tx,
            None,
            organization_id,
            INITIAL_PROJECT_NAME.to_string(),
            INITIAL_PROJECT_COLOR.to_string(),
        )
        .await?;

        TagRepository::create_default_tags(&mut **tx, project.id)
            .await
            .map_err(|e| ProjectError::DefaultTagsFailed(e.to_string()))?;

        ProjectStatusRepository::create_default_statuses(&mut **tx, project.id)
            .await
            .map_err(|e| ProjectError::DefaultStatusesFailed(e.to_string()))?;

        Ok(project)
    }

    /// Creates a project along with default tags and statuses in a single transaction.
    pub async fn create_with_defaults(
        pool: &PgPool,
        id: Option<Uuid>,
        organization_id: Uuid,
        name: String,
        color: String,
    ) -> Result<MutationResponse<Project>, ProjectError> {
        let mut tx = pool.begin().await?;

        let project = Self::create(&mut *tx, id, organization_id, name, color).await?;

        TagRepository::create_default_tags(&mut *tx, project.id)
            .await
            .map_err(|e| ProjectError::DefaultTagsFailed(e.to_string()))?;

        ProjectStatusRepository::create_default_statuses(&mut *tx, project.id)
            .await
            .map_err(|e| ProjectError::DefaultStatusesFailed(e.to_string()))?;

        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;
        Ok(MutationResponse {
            data: project,
            txid,
        })
    }
}
