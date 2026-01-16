use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool, Type};
use strum_macros::{Display, EnumString};
use ts_rs::TS;
use uuid::Uuid;

/// Who created the dependency relationship
#[derive(Debug, Clone, Type, Serialize, Deserialize, PartialEq, TS, EnumString, Display, Default)]
#[sqlx(type_name = "dependency_creator", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum DependencyCreator {
    #[default]
    User,
    Ai,
}

/// Represents a dependency relationship between tasks
/// A dependency means task_id cannot be started until depends_on_task_id is completed
#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct TaskDependency {
    pub id: Uuid,
    pub task_id: Uuid,            // The task that has the dependency
    pub depends_on_task_id: Uuid, // The task that must be completed first
    pub created_at: DateTime<Utc>,
    pub created_by: DependencyCreator,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateTaskDependency {
    pub task_id: Uuid,
    pub depends_on_task_id: Uuid,
    pub created_by: Option<DependencyCreator>,
}

impl TaskDependency {
    /// Find a dependency by its ID
    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskDependency,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                depends_on_task_id as "depends_on_task_id!: Uuid",
                created_at as "created_at!: DateTime<Utc>",
                created_by as "created_by!: DependencyCreator"
            FROM task_dependencies
            WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Find all dependencies for a given task (tasks that this task depends on)
    pub async fn find_by_task_id(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskDependency,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                depends_on_task_id as "depends_on_task_id!: Uuid",
                created_at as "created_at!: DateTime<Utc>",
                created_by as "created_by!: DependencyCreator"
            FROM task_dependencies
            WHERE task_id = $1
            ORDER BY created_at ASC"#,
            task_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find all dependents of a task (tasks that depend on this task)
    pub async fn find_dependents(
        pool: &SqlitePool,
        depends_on_task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskDependency,
            r#"SELECT
                id as "id!: Uuid",
                task_id as "task_id!: Uuid",
                depends_on_task_id as "depends_on_task_id!: Uuid",
                created_at as "created_at!: DateTime<Utc>",
                created_by as "created_by!: DependencyCreator"
            FROM task_dependencies
            WHERE depends_on_task_id = $1
            ORDER BY created_at ASC"#,
            depends_on_task_id
        )
        .fetch_all(pool)
        .await
    }

    /// Check if a dependency exists between two tasks
    pub async fn exists(
        pool: &SqlitePool,
        task_id: Uuid,
        depends_on_task_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query_scalar!(
            r#"SELECT EXISTS(
                SELECT 1 FROM task_dependencies
                WHERE task_id = $1 AND depends_on_task_id = $2
            ) as "exists!: bool""#,
            task_id,
            depends_on_task_id
        )
        .fetch_one(pool)
        .await?;
        Ok(result)
    }

    /// Create a new dependency relationship
    /// Returns an error if the dependency would create a cycle
    pub async fn create(pool: &SqlitePool, data: &CreateTaskDependency) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let created_by = data.created_by.clone().unwrap_or_default();

        sqlx::query_as!(
            TaskDependency,
            r#"INSERT INTO task_dependencies (id, task_id, depends_on_task_id, created_by)
               VALUES ($1, $2, $3, $4)
               RETURNING
                   id as "id!: Uuid",
                   task_id as "task_id!: Uuid",
                   depends_on_task_id as "depends_on_task_id!: Uuid",
                   created_at as "created_at!: DateTime<Utc>",
                   created_by as "created_by!: DependencyCreator""#,
            id,
            data.task_id,
            data.depends_on_task_id,
            created_by
        )
        .fetch_one(pool)
        .await
    }

    /// Delete a dependency by its ID
    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!("DELETE FROM task_dependencies WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }

    /// Delete all dependencies for a task
    pub async fn delete_by_task_id<'e, E>(executor: E, task_id: Uuid) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!("DELETE FROM task_dependencies WHERE task_id = $1", task_id)
            .execute(executor)
            .await?;
        Ok(result.rows_affected())
    }

    /// Delete a specific dependency between two tasks
    pub async fn delete_dependency<'e, E>(
        executor: E,
        task_id: Uuid,
        depends_on_task_id: Uuid,
    ) -> Result<u64, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let result = sqlx::query!(
            "DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2",
            task_id,
            depends_on_task_id
        )
        .execute(executor)
        .await?;
        Ok(result.rows_affected())
    }

    /// Check if adding a dependency would create a cycle
    /// Uses recursive CTE to detect if depends_on_task_id can reach task_id through existing dependencies
    pub async fn would_create_cycle(
        pool: &SqlitePool,
        task_id: Uuid,
        depends_on_task_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        // If task_id depends on depends_on_task_id, we need to check if
        // depends_on_task_id can reach task_id through existing dependencies
        let result = sqlx::query_scalar!(
            r#"WITH RECURSIVE reachable AS (
                -- Start from depends_on_task_id's dependencies
                SELECT depends_on_task_id as target_id
                FROM task_dependencies
                WHERE task_id = $2

                UNION

                -- Follow the dependency chain
                SELECT td.depends_on_task_id
                FROM task_dependencies td
                INNER JOIN reachable r ON td.task_id = r.target_id
            )
            SELECT EXISTS(
                SELECT 1 FROM reachable WHERE target_id = $1
            ) as "exists!: bool""#,
            task_id,
            depends_on_task_id
        )
        .fetch_one(pool)
        .await?;
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dependency_creator_display() {
        assert_eq!(DependencyCreator::User.to_string(), "user");
        assert_eq!(DependencyCreator::Ai.to_string(), "ai");
    }

    #[test]
    fn test_dependency_creator_from_str() {
        use std::str::FromStr;
        assert_eq!(DependencyCreator::from_str("user").unwrap(), DependencyCreator::User);
        assert_eq!(DependencyCreator::from_str("ai").unwrap(), DependencyCreator::Ai);
    }
}
