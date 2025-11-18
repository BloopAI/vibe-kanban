use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::Tx;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectStatus {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub color: String,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum ProjectStatusError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct ProjectStatusRepository;

impl ProjectStatusRepository {
    pub async fn find_by_id(
        tx: &mut Tx<'_>,
        id: Uuid,
    ) -> Result<Option<ProjectStatus>, ProjectStatusError> {
        let record = sqlx::query_as!(
            ProjectStatus,
            r#"
            SELECT
                id              AS "id!: Uuid",
                project_id      AS "project_id!: Uuid",
                name            AS "name!",
                color           AS "color!",
                sort_order      AS "sort_order!",
                created_at      AS "created_at!: DateTime<Utc>"
            FROM project_statuses
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
    ) -> Result<Option<ProjectStatus>, ProjectStatusError> {
        let record = sqlx::query_as!(
            ProjectStatus,
            r#"
            SELECT
                id              AS "id!: Uuid",
                project_id      AS "project_id!: Uuid",
                name            AS "name!",
                color           AS "color!",
                sort_order      AS "sort_order!",
                created_at      AS "created_at!: DateTime<Utc>"
            FROM project_statuses
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }
}
