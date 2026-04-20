use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct KanbanProjectStatus {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub color: String,
    #[ts(type = "number")]
    pub sort_order: i64,
    pub hidden: bool,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateKanbanProjectStatus {
    #[serde(default)]
    pub id: Option<Uuid>,
    pub project_id: Uuid,
    pub name: String,
    #[serde(default = "default_status_color")]
    pub color: String,
    #[ts(type = "number | null")]
    pub sort_order: Option<i64>,
    #[serde(default)]
    pub hidden: bool,
}

fn default_status_color() -> String {
    "#94a3b8".to_string()
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateKanbanProjectStatus {
    pub name: Option<String>,
    pub color: Option<String>,
    #[ts(type = "number | null")]
    pub sort_order: Option<i64>,
    pub hidden: Option<bool>,
}

impl KanbanProjectStatus {
    pub async fn find_by_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            KanbanProjectStatus,
            r#"SELECT
                id AS "id!: Uuid",
                project_id AS "project_id!: Uuid",
                name,
                color,
                sort_order,
                hidden AS "hidden!: bool",
                created_at AS "created_at!: DateTime<Utc>"
               FROM kanban_project_statuses
               WHERE project_id = $1
               ORDER BY sort_order ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            KanbanProjectStatus,
            r#"SELECT
                id AS "id!: Uuid",
                project_id AS "project_id!: Uuid",
                name,
                color,
                sort_order,
                hidden AS "hidden!: bool",
                created_at AS "created_at!: DateTime<Utc>"
               FROM kanban_project_statuses
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateKanbanProjectStatus,
    ) -> Result<Self, sqlx::Error> {
        let id = data.id.unwrap_or_else(Uuid::new_v4);
        let sort_order = match data.sort_order {
            Some(s) => s,
            None => {
                let max: Option<i64> = sqlx::query_scalar!(
                    r#"SELECT MAX(sort_order) AS "max: i64" FROM kanban_project_statuses WHERE project_id = $1"#,
                    data.project_id
                )
                .fetch_one(pool)
                .await?;
                max.unwrap_or(-1) + 1
            }
        };
        sqlx::query!(
            r#"INSERT INTO kanban_project_statuses (id, project_id, name, color, sort_order, hidden)
               VALUES ($1, $2, $3, $4, $5, $6)"#,
            id,
            data.project_id,
            data.name,
            data.color,
            sort_order,
            data.hidden,
        )
        .execute(pool)
        .await?;

        Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateKanbanProjectStatus,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query!(
            r#"UPDATE kanban_project_statuses
               SET name       = COALESCE($2, name),
                   color      = COALESCE($3, color),
                   sort_order = COALESCE($4, sort_order),
                   hidden     = COALESCE($5, hidden)
               WHERE id = $1"#,
            id,
            data.name,
            data.color,
            data.sort_order,
            data.hidden,
        )
        .execute(pool)
        .await?;

        Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!("DELETE FROM kanban_project_statuses WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Seed default statuses when a new project is created.
    pub async fn create_defaults(pool: &SqlitePool, project_id: Uuid) -> Result<(), sqlx::Error> {
        let defaults = [
            ("Backlog", "#94a3b8", 0i64, false),
            ("Todo", "#60a5fa", 1, false),
            ("In Progress", "#f59e0b", 2, false),
            ("Done", "#22c55e", 3, true),
        ];
        for (name, color, sort_order, hidden) in &defaults {
            let id = Uuid::new_v4();
            sqlx::query!(
                r#"INSERT INTO kanban_project_statuses (id, project_id, name, color, sort_order, hidden)
                   VALUES ($1, $2, $3, $4, $5, $6)"#,
                id,
                project_id,
                name,
                color,
                sort_order,
                hidden,
            )
            .execute(pool)
            .await?;
        }
        Ok(())
    }
}
