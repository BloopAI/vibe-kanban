use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::{Tx, types::ProjectVisibility};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteProject {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub color: String,
    pub visibility: ProjectVisibility,
    pub sprints_enabled: bool,
    pub sprint_duration_weeks: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum RemoteProjectError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct RemoteProjectRepository;

impl RemoteProjectRepository {
    pub async fn find_by_id(
        tx: &mut Tx<'_>,
        id: Uuid,
    ) -> Result<Option<RemoteProject>, RemoteProjectError> {
        let record = sqlx::query_as!(
            RemoteProject,
            r#"
            SELECT
                id                      AS "id!: Uuid",
                organization_id         AS "organization_id!: Uuid",
                name                    AS "name!",
                color                   AS "color!",
                visibility              AS "visibility!: ProjectVisibility",
                sprints_enabled         AS "sprints_enabled!",
                sprint_duration_weeks   AS "sprint_duration_weeks?: i32",
                created_at              AS "created_at!: DateTime<Utc>",
                updated_at              AS "updated_at!: DateTime<Utc>"
            FROM remote_projects
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn fetch_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<RemoteProject>, RemoteProjectError> {
        let record = sqlx::query_as!(
            RemoteProject,
            r#"
            SELECT
                id                      AS "id!: Uuid",
                organization_id         AS "organization_id!: Uuid",
                name                    AS "name!",
                color                   AS "color!",
                visibility              AS "visibility!: ProjectVisibility",
                sprints_enabled         AS "sprints_enabled!",
                sprint_duration_weeks   AS "sprint_duration_weeks?: i32",
                created_at              AS "created_at!: DateTime<Utc>",
                updated_at              AS "updated_at!: DateTime<Utc>"
            FROM remote_projects
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }

    pub async fn create(
        tx: &mut Tx<'_>,
        organization_id: Uuid,
        name: String,
        color: String,
        visibility: ProjectVisibility,
        sprints_enabled: bool,
        sprint_duration_weeks: Option<i32>,
    ) -> Result<RemoteProject, RemoteProjectError> {
        let id = Uuid::new_v4();
        let now = Utc::now();
        let record = sqlx::query_as!(
            RemoteProject,
            r#"
            INSERT INTO remote_projects (
                id, organization_id, name, color, visibility,
                sprints_enabled, sprint_duration_weeks, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING
                id                      AS "id!: Uuid",
                organization_id         AS "organization_id!: Uuid",
                name                    AS "name!",
                color                   AS "color!",
                visibility              AS "visibility!: ProjectVisibility",
                sprints_enabled         AS "sprints_enabled!",
                sprint_duration_weeks   AS "sprint_duration_weeks?: i32",
                created_at              AS "created_at!: DateTime<Utc>",
                updated_at              AS "updated_at!: DateTime<Utc>"
            "#,
            id,
            organization_id,
            name,
            color,
            visibility as ProjectVisibility,
            sprints_enabled,
            sprint_duration_weeks,
            now,
            now
        )
        .fetch_one(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn create_with_pool(
        pool: &PgPool,
        organization_id: Uuid,
        name: String,
        color: String,
        visibility: ProjectVisibility,
        sprints_enabled: bool,
        sprint_duration_weeks: Option<i32>,
    ) -> Result<RemoteProject, RemoteProjectError> {
        let mut tx = pool.begin().await?;
        let record = Self::create(
            &mut tx,
            organization_id,
            name,
            color,
            visibility,
            sprints_enabled,
            sprint_duration_weeks,
        )
        .await?;
        tx.commit().await?;
        Ok(record)
    }

    pub async fn update(
        tx: &mut Tx<'_>,
        id: Uuid,
        name: String,
        color: String,
        visibility: ProjectVisibility,
        sprints_enabled: bool,
        sprint_duration_weeks: Option<i32>,
    ) -> Result<RemoteProject, RemoteProjectError> {
        let updated_at = Utc::now();
        let record = sqlx::query_as!(
            RemoteProject,
            r#"
            UPDATE remote_projects
            SET
                name = $1,
                color = $2,
                visibility = $3,
                sprints_enabled = $4,
                sprint_duration_weeks = $5,
                updated_at = $6
            WHERE id = $7
            RETURNING
                id                      AS "id!: Uuid",
                organization_id         AS "organization_id!: Uuid",
                name                    AS "name!",
                color                   AS "color!",
                visibility              AS "visibility!: ProjectVisibility",
                sprints_enabled         AS "sprints_enabled!",
                sprint_duration_weeks   AS "sprint_duration_weeks?: i32",
                created_at              AS "created_at!: DateTime<Utc>",
                updated_at              AS "updated_at!: DateTime<Utc>"
            "#,
            name,
            color,
            visibility as ProjectVisibility,
            sprints_enabled,
            sprint_duration_weeks,
            updated_at,
            id
        )
        .fetch_one(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn update_with_pool(
        pool: &PgPool,
        id: Uuid,
        name: String,
        color: String,
        visibility: ProjectVisibility,
        sprints_enabled: bool,
        sprint_duration_weeks: Option<i32>,
    ) -> Result<RemoteProject, RemoteProjectError> {
        let mut tx = pool.begin().await?;
        let record = Self::update(
            &mut tx,
            id,
            name,
            color,
            visibility,
            sprints_enabled,
            sprint_duration_weeks,
        )
        .await?;
        tx.commit().await?;
        Ok(record)
    }

    pub async fn delete(tx: &mut Tx<'_>, id: Uuid) -> Result<(), RemoteProjectError> {
        sqlx::query!("DELETE FROM remote_projects WHERE id = $1", id)
            .execute(&mut **tx)
            .await?;
        Ok(())
    }

    pub async fn delete_with_pool(pool: &PgPool, id: Uuid) -> Result<(), RemoteProjectError> {
        let mut tx = pool.begin().await?;
        Self::delete(&mut tx, id).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn list_by_organization(
        tx: &mut Tx<'_>,
        organization_id: Uuid,
    ) -> Result<Vec<RemoteProject>, RemoteProjectError> {
        let records = sqlx::query_as!(
            RemoteProject,
            r#"
            SELECT
                id                      AS "id!: Uuid",
                organization_id         AS "organization_id!: Uuid",
                name                    AS "name!",
                color                   AS "color!",
                visibility              AS "visibility!: ProjectVisibility",
                sprints_enabled         AS "sprints_enabled!",
                sprint_duration_weeks   AS "sprint_duration_weeks?: i32",
                created_at              AS "created_at!: DateTime<Utc>",
                updated_at              AS "updated_at!: DateTime<Utc>"
            FROM remote_projects
            WHERE organization_id = $1
            "#,
            organization_id
        )
        .fetch_all(&mut **tx)
        .await?;

        Ok(records)
    }

    pub async fn fetch_by_organization(
        pool: &PgPool,
        organization_id: Uuid,
    ) -> Result<Vec<RemoteProject>, RemoteProjectError> {
        let records = sqlx::query_as!(
            RemoteProject,
            r#"
            SELECT
                id                      AS "id!: Uuid",
                organization_id         AS "organization_id!: Uuid",
                name                    AS "name!",
                color                   AS "color!",
                visibility              AS "visibility!: ProjectVisibility",
                sprints_enabled         AS "sprints_enabled!",
                sprint_duration_weeks   AS "sprint_duration_weeks?: i32",
                created_at              AS "created_at!: DateTime<Utc>",
                updated_at              AS "updated_at!: DateTime<Utc>"
            FROM remote_projects
            WHERE organization_id = $1
            "#,
            organization_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }
}
