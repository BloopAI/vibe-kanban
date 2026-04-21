use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Sqlite, SqlitePool, Transaction, Type};
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

pub struct CreateTask {
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub parent_workspace_id: Option<Uuid>,
}

impl Task {
    pub async fn create(pool: &SqlitePool, params: CreateTask) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            Task,
            r#"INSERT INTO tasks (id, project_id, title, description, status, parent_workspace_id, created_at, updated_at)
               VALUES ($1, $2, $3, $4, 'todo', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
               RETURNING id as "id!: Uuid",
                         project_id as "project_id!: Uuid",
                         title,
                         description,
                         status as "status!: TaskStatus",
                         parent_workspace_id as "parent_workspace_id: Uuid",
                         created_at as "created_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            params.project_id,
            params.title,
            params.description,
            params.parent_workspace_id
        )
        .fetch_one(pool)
        .await
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

pub struct UpdateTask {
    pub title: Option<String>,
    pub description: Option<Option<String>>, // None = no change; Some(None) = set NULL
    pub status: Option<TaskStatus>,
}

impl Task {
    /// D13: atomically clear `workspaces.task_id` references, then delete the
    /// task. A sibling workspace must outlive the task it was derived from
    /// (we only clear the FK, never cascade-delete the workspace).
    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        let mut tx = pool.begin().await?;
        sqlx::query!("UPDATE workspaces SET task_id = NULL WHERE task_id = ?", id)
            .execute(&mut *tx)
            .await?;
        let rows = sqlx::query!("DELETE FROM tasks WHERE id = ?", id)
            .execute(&mut *tx)
            .await?;
        if rows.rows_affected() == 0 {
            return Err(sqlx::Error::RowNotFound);
        }
        tx.commit().await?;
        Ok(())
    }
}

impl Task {
    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        params: UpdateTask,
    ) -> Result<(), sqlx::Error> {
        let mut task = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;
        if let Some(t) = params.title {
            task.title = t;
        }
        if let Some(d) = params.description {
            task.description = d;
        }
        if let Some(s) = params.status {
            task.status = s;
        }
        sqlx::query!(
            r#"UPDATE tasks
               SET title = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?"#,
            task.title,
            task.description,
            task.status,
            id
        )
        .execute(pool)
        .await?;
        Ok(())
    }
}

impl Task {
    pub async fn create_in_tx(
        tx: &mut Transaction<'_, Sqlite>,
        params: CreateTask,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as!(
            Task,
            r#"INSERT INTO tasks (id, project_id, title, description, status, parent_workspace_id, created_at, updated_at)
               VALUES ($1, $2, $3, $4, 'todo', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", title, description, status as "status!: TaskStatus", parent_workspace_id as "parent_workspace_id: Uuid", created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            params.project_id,
            params.title,
            params.description,
            params.parent_workspace_id,
        )
        .fetch_one(&mut **tx)
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::DBService;

    #[tokio::test]
    async fn create_inserts_task() -> sqlx::Result<()> {
        let db = DBService::new_in_memory().await?;
        let pool = &db.pool;
        let project_id = seed_project(pool).await;

        let task = Task::create(
            pool,
            CreateTask {
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
        assert_eq!(back.title, task.title);
        assert_eq!(back.description, task.description);
        Ok(())
    }

    #[tokio::test]
    async fn update_changes_fields() -> sqlx::Result<()> {
        let db = DBService::new_in_memory().await.expect("in-memory db");
        let pool = &db.pool;
        let project_id = seed_project(pool).await;

        let task = Task::create(
            pool,
            CreateTask {
                project_id,
                title: "a".into(),
                description: None,
                parent_workspace_id: None,
            },
        )
        .await?;

        Task::update(
            pool,
            task.id,
            UpdateTask {
                title: Some("b".into()),
                description: Some(Some("desc".into())),
                status: Some(TaskStatus::InProgress),
            },
        )
        .await?;

        let back = Task::find_by_id(pool, task.id).await?.expect("persisted");
        assert_eq!(back.title, "b");
        assert_eq!(back.description.as_deref(), Some("desc"));
        assert_eq!(back.status, TaskStatus::InProgress);
        Ok(())
    }

    #[tokio::test]
    async fn delete_cascades_workspace_task_id_to_null() -> sqlx::Result<()> {
        let db = DBService::new_in_memory().await.expect("in-memory db");
        let pool = &db.pool;
        let project_id = seed_project(pool).await;

        let task = Task::create(
            pool,
            CreateTask {
                project_id,
                title: "parent".into(),
                description: None,
                parent_workspace_id: None,
            },
        )
        .await?;
        let ws_id = seed_workspace_with_task(pool, task.id).await;

        Task::delete(pool, task.id).await?;

        // task removed
        assert!(Task::find_by_id(pool, task.id).await?.is_none());
        // workspace preserved, task_id cleared
        let ws_task_id: Option<Uuid> =
            sqlx::query_scalar(r#"SELECT task_id FROM workspaces WHERE id = ?"#)
                .bind(ws_id)
                .fetch_one(pool)
                .await?;
        assert_eq!(ws_task_id, None);
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

    #[tokio::test]
    async fn create_in_tx_rolls_back_on_abort() -> sqlx::Result<()> {
        let db = DBService::new_in_memory().await.expect("in-memory db");
        let pool = &db.pool;
        let project_id = seed_project(pool).await;

        let mut tx = pool.begin().await?;
        Task::create_in_tx(
            &mut tx,
            CreateTask {
                project_id,
                title: "t".into(),
                description: None,
                parent_workspace_id: None,
            },
        )
        .await?;
        // drop tx without commit
        drop(tx);

        let all = Task::find_all(pool).await?;
        assert!(all.iter().all(|t| t.title != "t"));
        Ok(())
    }

    async fn seed_workspace_with_task(pool: &sqlx::SqlitePool, task_id: Uuid) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO workspaces \
             (id, task_id, branch, created_at, updated_at, archived, pinned, worktree_deleted) \
         VALUES (?, ?, 'main', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 0, 0)",
        )
        .bind(id)
        .bind(task_id)
        .execute(pool)
        .await
        .unwrap();
        id
    }
}
