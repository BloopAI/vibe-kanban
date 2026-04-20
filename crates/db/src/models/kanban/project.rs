use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct KanbanProject {
    pub id: Uuid,
    pub name: String,
    pub color: String,
    #[ts(type = "number")]
    pub sort_order: i64,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "string")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateKanbanProject {
    #[serde(default)]
    pub id: Option<Uuid>,
    pub name: String,
    #[serde(default = "default_project_color")]
    pub color: String,
}

fn default_project_color() -> String {
    "#6366f1".to_string()
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateKanbanProject {
    pub name: Option<String>,
    pub color: Option<String>,
    #[ts(type = "number | null")]
    pub sort_order: Option<i64>,
}

impl KanbanProject {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            KanbanProject,
            r#"SELECT
                id AS "id!: Uuid",
                name,
                color,
                sort_order,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
               FROM kanban_projects
               ORDER BY sort_order ASC, created_at ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            KanbanProject,
            r#"SELECT
                id AS "id!: Uuid",
                name,
                color,
                sort_order,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
               FROM kanban_projects
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateKanbanProject,
    ) -> Result<Self, sqlx::Error> {
        let id = data.id.unwrap_or_else(Uuid::new_v4);
        sqlx::query!(
            r#"INSERT INTO kanban_projects (id, name, color, sort_order)
               VALUES ($1, $2, $3, COALESCE((SELECT MAX(sort_order) + 1 FROM kanban_projects), 0))"#,
            id,
            data.name,
            data.color,
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
        data: &UpdateKanbanProject,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query!(
            r#"UPDATE kanban_projects
               SET name       = COALESCE($2, name),
                   color      = COALESCE($3, color),
                   sort_order = COALESCE($4, sort_order),
                   updated_at = datetime('now', 'subsec')
               WHERE id = $1"#,
            id,
            data.name,
            data.color,
            data.sort_order,
        )
        .execute(pool)
        .await?;

        Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!("DELETE FROM kanban_projects WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
