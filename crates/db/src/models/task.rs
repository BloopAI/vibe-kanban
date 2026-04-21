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

pub struct TaskCreateParams {
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub parent_workspace_id: Option<Uuid>,
}

impl Task {
    pub async fn create(pool: &SqlitePool, params: TaskCreateParams) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query!(
            r#"INSERT INTO tasks (id, project_id, title, description, status, parent_workspace_id, created_at, updated_at)
               VALUES ($1, $2, $3, $4, 'todo', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"#,
            id,
            params.project_id,
            params.title,
            params.description,
            params.parent_workspace_id
        )
        .execute(pool)
        .await?;
        Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)
    }

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::DBService;

    #[tokio::test]
    async fn create_inserts_task() -> anyhow::Result<()> {
        let db = DBService::new_in_memory().await?;
        let pool = &db.pool;
        let project_id = seed_project(pool).await;

        let task = Task::create(
            pool,
            TaskCreateParams {
                project_id,
                title: "todo-1".into(),
                description: Some("desc".into()),
                parent_workspace_id: None,
            },
        )
        .await?;
        assert_eq!(task.title, "todo-1");
        assert_eq!(task.status, TaskStatus::Todo);

        let back = Task::find_by_id(pool, task.id).await?.expect("persisted");
        assert_eq!(back.id, task.id);
        Ok(())
    }

    async fn seed_project(pool: &sqlx::SqlitePool) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO projects (id, name, created_at, updated_at) \
             VALUES (?1, 'p', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        )
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
        id
    }
}
