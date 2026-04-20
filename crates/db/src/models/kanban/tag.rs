use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct KanbanTag {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub color: String,
    #[ts(type = "string")]
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct CreateKanbanTag {
    #[serde(default)]
    pub id: Option<Uuid>,
    pub project_id: Uuid,
    pub name: String,
    #[serde(default = "default_tag_color")]
    pub color: String,
}

fn default_tag_color() -> String {
    "#94a3b8".to_string()
}

#[derive(Debug, Clone, Deserialize, TS)]
pub struct UpdateKanbanTag {
    pub name: Option<String>,
    pub color: Option<String>,
}

impl KanbanTag {
    pub async fn find_by_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            KanbanTag,
            r#"SELECT
                id AS "id!: Uuid",
                project_id AS "project_id!: Uuid",
                name,
                color,
                created_at AS "created_at!: DateTime<Utc>"
               FROM kanban_tags
               WHERE project_id = $1
               ORDER BY name ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            KanbanTag,
            r#"SELECT
                id AS "id!: Uuid",
                project_id AS "project_id!: Uuid",
                name,
                color,
                created_at AS "created_at!: DateTime<Utc>"
               FROM kanban_tags
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(pool: &SqlitePool, data: &CreateKanbanTag) -> Result<Self, sqlx::Error> {
        let id = data.id.unwrap_or_else(Uuid::new_v4);
        sqlx::query!(
            r#"INSERT INTO kanban_tags (id, project_id, name, color)
               VALUES ($1, $2, $3, $4)"#,
            id,
            data.project_id,
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
        data: &UpdateKanbanTag,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query!(
            r#"UPDATE kanban_tags
               SET name  = COALESCE($2, name),
                   color = COALESCE($3, color)
               WHERE id = $1"#,
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

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!("DELETE FROM kanban_tags WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
