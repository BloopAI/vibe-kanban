use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, PgPool, Postgres};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::get_txid;
use crate::mutation_types::{DeleteResponse, MutationResponse};

/// Default statuses that are created for each new project (name, color, sort_order)
pub const DEFAULT_STATUSES: &[(&str, &str, i32)] = &[
    ("Backlog", "#6b7280", 0),
    ("To do", "#3b82f6", 1),
    ("In progress", "#f59e0b", 2),
    ("In review", "#8b5cf6", 3),
    ("Done", "#22c55e", 4),
    ("Cancelled", "#ef4444", 5),
];

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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
    pub async fn find_by_id<'e, E>(
        executor: E,
        id: Uuid,
    ) -> Result<Option<ProjectStatus>, ProjectStatusError>
    where
        E: Executor<'e, Database = Postgres>,
    {
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
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }

    pub async fn create(
        pool: &PgPool,
        id: Option<Uuid>,
        project_id: Uuid,
        name: String,
        color: String,
        sort_order: i32,
    ) -> Result<MutationResponse<ProjectStatus>, ProjectStatusError> {
        let mut tx = pool.begin().await?;
        let id = id.unwrap_or_else(Uuid::new_v4);
        let created_at = Utc::now();
        let data = sqlx::query_as!(
            ProjectStatus,
            r#"
            INSERT INTO project_statuses (id, project_id, name, color, sort_order, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id              AS "id!: Uuid",
                project_id      AS "project_id!: Uuid",
                name            AS "name!",
                color           AS "color!",
                sort_order      AS "sort_order!",
                created_at      AS "created_at!: DateTime<Utc>"
            "#,
            id,
            project_id,
            name,
            color,
            sort_order,
            created_at
        )
        .fetch_one(&mut *tx)
        .await?;

        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;
        Ok(MutationResponse { data, txid })
    }

    /// Update a project status with partial fields. Uses COALESCE to preserve existing values
    /// when None is provided.
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        name: Option<String>,
        color: Option<String>,
        sort_order: Option<i32>,
    ) -> Result<MutationResponse<ProjectStatus>, ProjectStatusError> {
        let mut tx = pool.begin().await?;
        let data = sqlx::query_as!(
            ProjectStatus,
            r#"
            UPDATE project_statuses
            SET
                name = COALESCE($1, name),
                color = COALESCE($2, color),
                sort_order = COALESCE($3, sort_order)
            WHERE id = $4
            RETURNING
                id              AS "id!: Uuid",
                project_id      AS "project_id!: Uuid",
                name            AS "name!",
                color           AS "color!",
                sort_order      AS "sort_order!",
                created_at      AS "created_at!: DateTime<Utc>"
            "#,
            name,
            color,
            sort_order,
            id
        )
        .fetch_one(&mut *tx)
        .await?;

        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;
        Ok(MutationResponse { data, txid })
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<DeleteResponse, ProjectStatusError> {
        let mut tx = pool.begin().await?;
        sqlx::query!("DELETE FROM project_statuses WHERE id = $1", id)
            .execute(&mut *tx)
            .await?;
        let txid = get_txid(&mut *tx).await?;
        tx.commit().await?;
        Ok(DeleteResponse { txid })
    }

    pub async fn list_by_project<'e, E>(
        executor: E,
        project_id: Uuid,
    ) -> Result<Vec<ProjectStatus>, ProjectStatusError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let records = sqlx::query_as!(
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
            WHERE project_id = $1
            "#,
            project_id
        )
        .fetch_all(executor)
        .await?;

        Ok(records)
    }

    pub async fn create_default_statuses<'e, E>(
        executor: E,
        project_id: Uuid,
    ) -> Result<Vec<ProjectStatus>, ProjectStatusError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let names: Vec<String> = DEFAULT_STATUSES
            .iter()
            .map(|(n, _, _)| (*n).to_string())
            .collect();
        let colors: Vec<String> = DEFAULT_STATUSES
            .iter()
            .map(|(_, c, _)| (*c).to_string())
            .collect();
        let sort_orders: Vec<i32> = DEFAULT_STATUSES.iter().map(|(_, _, s)| *s).collect();

        let statuses = sqlx::query_as!(
            ProjectStatus,
            r#"
            INSERT INTO project_statuses (id, project_id, name, color, sort_order, created_at)
            SELECT gen_random_uuid(), $1, name, color, sort_order, NOW()
            FROM UNNEST($2::text[], $3::text[], $4::int[]) AS t(name, color, sort_order)
            RETURNING
                id              AS "id!: Uuid",
                project_id      AS "project_id!: Uuid",
                name            AS "name!",
                color           AS "color!",
                sort_order      AS "sort_order!",
                created_at      AS "created_at!: DateTime<Utc>"
            "#,
            project_id,
            &names,
            &colors,
            &sort_orders
        )
        .fetch_all(executor)
        .await?;

        Ok(statuses)
    }
}
