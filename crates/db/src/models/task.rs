use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool, Type};
use strum_macros::{Display, EnumString};
use ts_rs::TS;
use uuid::Uuid;

#[derive(
    Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display, Default,
)]
#[sqlx(type_name = "task_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum TaskStatus {
    #[default]
    Todo,
    InProgress,
    InReview,
    Done,
    Cancelled,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Task {
    pub id: Uuid,
    pub project_id: Uuid, // Foreign key to Project
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub parent_workspace_id: Option<Uuid>, // Foreign key to parent Workspace
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Task {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", parent_workspace_id as "parent_workspace_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tasks
               ORDER BY created_at ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_project(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as::<_, Task>(
            r#"SELECT id, project_id, title, description, status, parent_workspace_id, created_at, updated_at
               FROM tasks
               WHERE project_id = ?
               ORDER BY created_at ASC"#,
        )
        .bind(project_id)
        .fetch_all(pool)
        .await
    }

    pub async fn create(
        pool: &SqlitePool,
        project_id: Uuid,
        title: String,
        description: Option<String>,
        status: TaskStatus,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query(
            r#"INSERT INTO tasks (id, project_id, title, description, status)
               VALUES (?, ?, ?, ?, ?)"#,
        )
        .bind(id)
        .bind(project_id)
        .bind(&title)
        .bind(&description)
        .bind(&status)
        .execute(pool)
        .await?;

        Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        title: Option<String>,
        description: Option<Option<String>>,
        status: Option<TaskStatus>,
        parent_workspace_id: Option<Option<Uuid>>,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;
        let next_title = title.unwrap_or(existing.title);
        let next_description = description.unwrap_or(existing.description);
        let next_status = status.unwrap_or(existing.status);
        let next_parent_workspace_id = parent_workspace_id.unwrap_or(existing.parent_workspace_id);

        sqlx::query(
            r#"UPDATE tasks
               SET title = ?,
                   description = ?,
                   status = ?,
                   parent_workspace_id = ?,
                   updated_at = datetime('now', 'subsec')
               WHERE id = ?"#,
        )
        .bind(&next_title)
        .bind(&next_description)
        .bind(&next_status)
        .bind(next_parent_workspace_id)
        .bind(id)
        .execute(pool)
        .await?;

        Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query(r#"DELETE FROM tasks WHERE id = ?"#)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Task,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", parent_workspace_id as "parent_workspace_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM tasks
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }
}
