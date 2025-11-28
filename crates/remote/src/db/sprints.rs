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

    pub async fn create(
        tx: &mut Tx<'_>,
        project_id: Uuid,
        label: String,
        sequence_number: i32,
        start_date: NaiveDate,
        end_date: NaiveDate,
        status: SprintStatus,
    ) -> Result<Sprint, SprintError> {
        let id = Uuid::new_v4();
        let created_at = Utc::now();
        let record = sqlx::query_as!(
            Sprint,
            r#"
            INSERT INTO sprints (
                id, project_id, label, sequence_number, start_date, end_date, status, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                label               AS "label!",
                sequence_number     AS "sequence_number!",
                start_date          AS "start_date!",
                end_date            AS "end_date!",
                status              AS "status!: SprintStatus",
                created_at          AS "created_at!: DateTime<Utc>"
            "#,
            id,
            project_id,
            label,
            sequence_number,
            start_date,
            end_date,
            status as SprintStatus,
            created_at
        )
        .fetch_one(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn create_with_pool(
        pool: &PgPool,
        project_id: Uuid,
        label: String,
        sequence_number: i32,
        start_date: NaiveDate,
        end_date: NaiveDate,
        status: SprintStatus,
    ) -> Result<Sprint, SprintError> {
        let mut tx = pool.begin().await?;
        let record = Self::create(
            &mut tx,
            project_id,
            label,
            sequence_number,
            start_date,
            end_date,
            status,
        )
        .await?;
        tx.commit().await?;
        Ok(record)
    }

    pub async fn update(
        tx: &mut Tx<'_>,
        id: Uuid,
        label: String,
        sequence_number: i32,
        start_date: NaiveDate,
        end_date: NaiveDate,
        status: SprintStatus,
    ) -> Result<Sprint, SprintError> {
        let record = sqlx::query_as!(
            Sprint,
            r#"
            UPDATE sprints
            SET
                label = $1,
                sequence_number = $2,
                start_date = $3,
                end_date = $4,
                status = $5
            WHERE id = $6
            RETURNING
                id                  AS "id!: Uuid",
                project_id          AS "project_id!: Uuid",
                label               AS "label!",
                sequence_number     AS "sequence_number!",
                start_date          AS "start_date!",
                end_date            AS "end_date!",
                status              AS "status!: SprintStatus",
                created_at          AS "created_at!: DateTime<Utc>"
            "#,
            label,
            sequence_number,
            start_date,
            end_date,
            status as SprintStatus,
            id
        )
        .fetch_one(&mut **tx)
        .await?;

        Ok(record)
    }

    pub async fn update_with_pool(
        pool: &PgPool,
        id: Uuid,
        label: String,
        sequence_number: i32,
        start_date: NaiveDate,
        end_date: NaiveDate,
        status: SprintStatus,
    ) -> Result<Sprint, SprintError> {
        let mut tx = pool.begin().await?;
        let record = Self::update(
            &mut tx,
            id,
            label,
            sequence_number,
            start_date,
            end_date,
            status,
        )
        .await?;
        tx.commit().await?;
        Ok(record)
    }

    pub async fn delete(tx: &mut Tx<'_>, id: Uuid) -> Result<(), SprintError> {
        sqlx::query!("DELETE FROM sprints WHERE id = $1", id)
            .execute(&mut **tx)
            .await?;
        Ok(())
    }

    pub async fn delete_with_pool(pool: &PgPool, id: Uuid) -> Result<(), SprintError> {
        let mut tx = pool.begin().await?;
        Self::delete(&mut tx, id).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn list_by_project(
        tx: &mut Tx<'_>,
        project_id: Uuid,
    ) -> Result<Vec<Sprint>, SprintError> {
        let records = sqlx::query_as!(
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
            WHERE project_id = $1
            "#,
            project_id
        )
        .fetch_all(&mut **tx)
        .await?;

        Ok(records)
    }

    pub async fn fetch_by_project(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Vec<Sprint>, SprintError> {
        let records = sqlx::query_as!(
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
            WHERE project_id = $1
            "#,
            project_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }
}
