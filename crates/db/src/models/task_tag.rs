use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct TaskTag {
    pub id: Uuid,
    pub project_id: Option<Uuid>, // None for global tags
    pub tag_name: String,
    pub content: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateTaskTag {
    pub project_id: Option<Uuid>,
    pub tag_name: String,
    pub content: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateTaskTag {
    pub tag_name: Option<String>,
    pub content: Option<String>,
}

impl TaskTag {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskTag,
            r#"SELECT id as "id!: Uuid", project_id as "project_id?: Uuid", tag_name, content, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM task_tags
               ORDER BY project_id IS NULL DESC, tag_name ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_project_id(
        pool: &SqlitePool,
        project_id: Option<Uuid>,
    ) -> Result<Vec<Self>, sqlx::Error> {
        if let Some(pid) = project_id {
            // Return only project-specific tags
            sqlx::query_as!(
                TaskTag,
                r#"SELECT id as "id!: Uuid", project_id as "project_id?: Uuid", tag_name, content, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
                   FROM task_tags
                   WHERE project_id = ?
                   ORDER BY tag_name ASC"#,
                pid
            )
            .fetch_all(pool)
            .await
        } else {
            // Return only global tags
            sqlx::query_as!(
                TaskTag,
                r#"SELECT id as "id!: Uuid", project_id as "project_id?: Uuid", tag_name, content, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
                   FROM task_tags
                   WHERE project_id IS NULL
                   ORDER BY tag_name ASC"#
            )
            .fetch_all(pool)
            .await
        }
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskTag,
            r#"SELECT id as "id!: Uuid", project_id as "project_id?: Uuid", tag_name, content, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM task_tags
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(pool: &SqlitePool, data: &CreateTaskTag) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            TaskTag,
            r#"INSERT INTO task_tags (id, project_id, tag_name, content)
               VALUES ($1, $2, $3, $4)
               RETURNING id as "id!: Uuid", project_id as "project_id?: Uuid", tag_name, content, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.project_id,
            data.tag_name,
            data.content
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateTaskTag,
    ) -> Result<Self, sqlx::Error> {
        // Get existing tag first
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        // Use let bindings to create longer-lived values
        let tag_name = data.tag_name.as_ref().unwrap_or(&existing.tag_name);
        let content = data.content.as_ref().or(existing.content.as_ref());

        sqlx::query_as!(
            TaskTag,
            r#"UPDATE task_tags
               SET tag_name = $2, content = $3, updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING id as "id!: Uuid", project_id as "project_id?: Uuid", tag_name, content, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            tag_name,
            content
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM task_tags WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
