use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::{Tx, types::SprintStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sprint {
    pub id: Uuid,
    pub project_id: Uuid,
    pub label: String,
    pub sequence_number: i32,
    pub start_date: NaiveDate,
    pub end_date: NaiveDate,
    pub status: SprintStatus,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum SprintError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct SprintRepository;

impl SprintRepository {
    pub async fn find_by_id(tx: &mut Tx<'_>, id: Uuid) -> Result<Option<Sprint>, SprintError> {
        let record = sqlx::query_as!(
            Sprint,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                label               AS "label!",
                sequence_number     AS "sequence_number!",
                start_date          AS "start_date!",
                end_date            AS "end_date!",
                status              AS "status!: SprintStatus",
                created_at          AS "created_at!: DateTime<Utc>"
            FROM sprints
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn fetch_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Sprint>, SprintError> {
        let record = sqlx::query_as!(
            Sprint,
            r#"
            SELECT
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                label               AS "label!",
                sequence_number     AS "sequence_number!",
                start_date          AS "start_date!",
                end_date            AS "end_date!",
                status              AS "status!: SprintStatus",
                created_at          AS "created_at!: DateTime<Utc>"
            FROM sprints
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record)
    }
}
