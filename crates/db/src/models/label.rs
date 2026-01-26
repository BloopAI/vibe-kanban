use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Label {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub color: String,
    pub executor: Option<String>, // Optional: specific executor/agent for this label type
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateLabel {
    pub project_id: Uuid,
    pub name: String,
    pub color: Option<String>,
    pub executor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UpdateLabel {
    pub name: Option<String>,
    pub color: Option<String>,
    pub executor: Option<String>,
}

/// A label attached to a task
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct TaskLabel {
    pub task_id: Uuid,
    pub label_id: Uuid,
    pub created_at: DateTime<Utc>,
}

impl Label {
    pub async fn find_by_project_id(
        pool: &SqlitePool,
        project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Label,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", name, color, executor, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM labels
               WHERE project_id = $1
               ORDER BY name ASC"#,
            project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Label,
            r#"SELECT id as "id!: Uuid", project_id as "project_id!: Uuid", name, color, executor, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>"
               FROM labels
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn create(pool: &SqlitePool, data: &CreateLabel) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let color = data.color.as_deref().unwrap_or("#6366f1"); // Default indigo
        sqlx::query_as!(
            Label,
            r#"INSERT INTO labels (id, project_id, name, color, executor)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", name, color, executor, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.project_id,
            data.name,
            color,
            data.executor
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateLabel,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let name = data.name.as_ref().unwrap_or(&existing.name);
        let color = data.color.as_ref().unwrap_or(&existing.color);
        // For executor, we need to handle Option<Option<String>> - None means don't update, Some(None) means set to null
        let executor = if data.executor.is_some() {
            data.executor.as_ref()
        } else {
            existing.executor.as_ref()
        };

        sqlx::query_as!(
            Label,
            r#"UPDATE labels
               SET name = $2, color = $3, executor = $4, updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING id as "id!: Uuid", project_id as "project_id!: Uuid", name, color, executor, created_at as "created_at!: DateTime<Utc>", updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            color,
            executor
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM labels WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Get all labels for a task
    pub async fn find_by_task_id(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Label,
            r#"SELECT l.id as "id!: Uuid", l.project_id as "project_id!: Uuid", l.name, l.color, l.executor, l.created_at as "created_at!: DateTime<Utc>", l.updated_at as "updated_at!: DateTime<Utc>"
               FROM labels l
               INNER JOIN task_labels tl ON tl.label_id = l.id
               WHERE tl.task_id = $1
               ORDER BY l.name ASC"#,
            task_id
        )
        .fetch_all(pool)
        .await
    }

    /// Add a label to a task
    pub async fn add_to_task(
        pool: &SqlitePool,
        task_id: Uuid,
        label_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "INSERT OR IGNORE INTO task_labels (task_id, label_id) VALUES ($1, $2)",
            task_id,
            label_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Remove a label from a task
    pub async fn remove_from_task(
        pool: &SqlitePool,
        task_id: Uuid,
        label_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "DELETE FROM task_labels WHERE task_id = $1 AND label_id = $2",
            task_id,
            label_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Set labels for a task (replaces all existing labels)
    pub async fn set_task_labels(
        pool: &SqlitePool,
        task_id: Uuid,
        label_ids: &[Uuid],
    ) -> Result<(), sqlx::Error> {
        // Remove all existing labels
        sqlx::query!("DELETE FROM task_labels WHERE task_id = $1", task_id)
            .execute(pool)
            .await?;

        // Add new labels
        for label_id in label_ids {
            sqlx::query!(
                "INSERT INTO task_labels (task_id, label_id) VALUES ($1, $2)",
                task_id,
                label_id
            )
            .execute(pool)
            .await?;
        }

        Ok(())
    }
}

/// Task dependency representation
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct TaskDependency {
    pub task_id: Uuid,
    pub depends_on_task_id: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateTaskDependency {
    pub task_id: Uuid,
    pub depends_on_task_id: Uuid,
}

impl TaskDependency {
    /// Get all dependencies for a task (tasks this task depends on)
    pub async fn find_dependencies(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        let records = sqlx::query!(
            "SELECT depends_on_task_id as \"depends_on_task_id!: Uuid\" FROM task_dependencies WHERE task_id = $1",
            task_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records.into_iter().map(|r| r.depends_on_task_id).collect())
    }

    /// Get all tasks that depend on a given task (dependents)
    pub async fn find_dependents(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        let records = sqlx::query!(
            "SELECT task_id as \"task_id!: Uuid\" FROM task_dependencies WHERE depends_on_task_id = $1",
            task_id
        )
        .fetch_all(pool)
        .await?;

        Ok(records.into_iter().map(|r| r.task_id).collect())
    }

    /// Add a dependency
    pub async fn create(
        pool: &SqlitePool,
        task_id: Uuid,
        depends_on_task_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2)",
            task_id,
            depends_on_task_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Remove a dependency
    pub async fn delete(
        pool: &SqlitePool,
        task_id: Uuid,
        depends_on_task_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            "DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2",
            task_id,
            depends_on_task_id
        )
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Set all dependencies for a task (replaces existing)
    pub async fn set_dependencies(
        pool: &SqlitePool,
        task_id: Uuid,
        depends_on_task_ids: &[Uuid],
    ) -> Result<(), sqlx::Error> {
        // Remove all existing dependencies
        sqlx::query!("DELETE FROM task_dependencies WHERE task_id = $1", task_id)
            .execute(pool)
            .await?;

        // Add new dependencies
        for depends_on_id in depends_on_task_ids {
            sqlx::query!(
                "INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2)",
                task_id,
                depends_on_id
            )
            .execute(pool)
            .await?;
        }

        Ok(())
    }

    /// Check if a task has all its dependencies completed
    pub async fn are_dependencies_met(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let unmet = sqlx::query!(
            r#"SELECT COUNT(*) as "count!: i64"
               FROM task_dependencies td
               JOIN tasks t ON t.id = td.depends_on_task_id
               WHERE td.task_id = $1 AND t.status != 'done'"#,
            task_id
        )
        .fetch_one(pool)
        .await?;

        Ok(unmet.count == 0)
    }
}
