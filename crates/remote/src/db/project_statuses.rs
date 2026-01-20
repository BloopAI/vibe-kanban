use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, Postgres};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

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

    pub async fn create<'e, E>(
        executor: E,
        project_id: Uuid,
        name: String,
        color: String,
        sort_order: i32,
    ) -> Result<ProjectStatus, ProjectStatusError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = Uuid::new_v4();
        let created_at = Utc::now();
        let record = sqlx::query_as!(
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
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn update<'e, E>(
        executor: E,
        id: Uuid,
        name: String,
        color: String,
        sort_order: i32,
    ) -> Result<ProjectStatus, ProjectStatusError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            ProjectStatus,
            r#"
            UPDATE project_statuses
            SET
                name = $1,
                color = $2,
                sort_order = $3
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
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<(), ProjectStatusError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query!("DELETE FROM project_statuses WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(())
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
