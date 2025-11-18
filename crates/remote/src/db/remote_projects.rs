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
}
