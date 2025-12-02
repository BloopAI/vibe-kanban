use chrono::Utc;
use sqlx::{PgPool, Row};
use thiserror::Error;
use uuid::Uuid;

use crate::nodes::{NodeTaskAssignment, UpdateAssignmentData};

#[derive(Debug, Error)]
pub enum TaskAssignmentError {
    #[error("task assignment not found")]
    NotFound,
    #[error("task already has an active assignment")]
    AlreadyAssigned,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

pub struct TaskAssignmentRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> TaskAssignmentRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    /// Create a new task assignment
    pub async fn create(
        &self,
        task_id: Uuid,
        node_id: Uuid,
        node_project_id: Uuid,
    ) -> Result<NodeTaskAssignment, TaskAssignmentError> {
        let assignment = sqlx::query_as::<_, NodeTaskAssignment>(
            r#"
            INSERT INTO node_task_assignments (task_id, node_id, node_project_id)
            VALUES ($1, $2, $3)
            RETURNING
                id,
                task_id,
                node_id,
                node_project_id,
                local_task_id,
                local_attempt_id,
                execution_status,
                assigned_at,
                started_at,
                completed_at,
                created_at
            "#,
        )
        .bind(task_id)
        .bind(node_id)
        .bind(node_project_id)
        .fetch_one(self.pool)
        .await
        .map_err(|e| {
            if let sqlx::Error::Database(ref db_err) = e {
                // Check for unique constraint violation on active assignments
                if db_err.constraint() == Some("idx_task_assignments_active") {
                    return TaskAssignmentError::AlreadyAssigned;
                }
            }
            TaskAssignmentError::Database(e)
        })?;

        Ok(assignment)
    }

    /// Find an assignment by ID
    pub async fn find_by_id(&self, assignment_id: Uuid) -> Result<Option<NodeTaskAssignment>, TaskAssignmentError> {
        let assignment = sqlx::query_as::<_, NodeTaskAssignment>(
            r#"
            SELECT
                id,
                task_id,
                node_id,
                node_project_id,
                local_task_id,
                local_attempt_id,
                execution_status,
                assigned_at,
                started_at,
                completed_at,
                created_at
            FROM node_task_assignments
            WHERE id = $1
            "#,
        )
        .bind(assignment_id)
        .fetch_optional(self.pool)
        .await?;

        Ok(assignment)
    }

    /// Find the active assignment for a task (if any)
    pub async fn find_active_for_task(&self, task_id: Uuid) -> Result<Option<NodeTaskAssignment>, TaskAssignmentError> {
        let assignment = sqlx::query_as::<_, NodeTaskAssignment>(
            r#"
            SELECT
                id,
                task_id,
                node_id,
                node_project_id,
                local_task_id,
                local_attempt_id,
                execution_status,
                assigned_at,
                started_at,
                completed_at,
                created_at
            FROM node_task_assignments
            WHERE task_id = $1
              AND completed_at IS NULL
            "#,
        )
        .bind(task_id)
        .fetch_optional(self.pool)
        .await?;

        Ok(assignment)
    }

    /// List all assignments for a node
    pub async fn list_by_node(&self, node_id: Uuid) -> Result<Vec<NodeTaskAssignment>, TaskAssignmentError> {
        let assignments = sqlx::query_as::<_, NodeTaskAssignment>(
            r#"
            SELECT
                id,
                task_id,
                node_id,
                node_project_id,
                local_task_id,
                local_attempt_id,
                execution_status,
                assigned_at,
                started_at,
                completed_at,
                created_at
            FROM node_task_assignments
            WHERE node_id = $1
            ORDER BY assigned_at DESC
            "#,
        )
        .bind(node_id)
        .fetch_all(self.pool)
        .await?;

        Ok(assignments)
    }

    /// List active assignments for a node
    pub async fn list_active_by_node(&self, node_id: Uuid) -> Result<Vec<NodeTaskAssignment>, TaskAssignmentError> {
        let assignments = sqlx::query_as::<_, NodeTaskAssignment>(
            r#"
            SELECT
                id,
                task_id,
                node_id,
                node_project_id,
                local_task_id,
                local_attempt_id,
                execution_status,
                assigned_at,
                started_at,
                completed_at,
                created_at
            FROM node_task_assignments
            WHERE node_id = $1
              AND completed_at IS NULL
            ORDER BY assigned_at DESC
            "#,
        )
        .bind(node_id)
        .fetch_all(self.pool)
        .await?;

        Ok(assignments)
    }

    /// Update an assignment with local IDs and status
    pub async fn update(
        &self,
        assignment_id: Uuid,
        data: UpdateAssignmentData,
    ) -> Result<NodeTaskAssignment, TaskAssignmentError> {
        let assignment = sqlx::query_as::<_, NodeTaskAssignment>(
            r#"
            UPDATE node_task_assignments
            SET local_task_id = COALESCE($2, local_task_id),
                local_attempt_id = COALESCE($3, local_attempt_id),
                execution_status = COALESCE($4, execution_status),
                started_at = CASE
                    WHEN $4 = 'running' AND started_at IS NULL THEN NOW()
                    ELSE started_at
                END
            WHERE id = $1
            RETURNING
                id,
                task_id,
                node_id,
                node_project_id,
                local_task_id,
                local_attempt_id,
                execution_status,
                assigned_at,
                started_at,
                completed_at,
                created_at
            "#,
        )
        .bind(assignment_id)
        .bind(data.local_task_id)
        .bind(data.local_attempt_id)
        .bind(&data.execution_status)
        .fetch_optional(self.pool)
        .await?
        .ok_or(TaskAssignmentError::NotFound)?;

        Ok(assignment)
    }

    /// Mark an assignment as completed
    pub async fn complete(&self, assignment_id: Uuid, status: &str) -> Result<(), TaskAssignmentError> {
        let result = sqlx::query(
            r#"
            UPDATE node_task_assignments
            SET execution_status = $2,
                completed_at = $3
            WHERE id = $1
            "#,
        )
        .bind(assignment_id)
        .bind(status)
        .bind(Utc::now())
        .execute(self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(TaskAssignmentError::NotFound);
        }

        Ok(())
    }

    /// Fail all active assignments for a node (used when node goes offline)
    pub async fn fail_node_assignments(&self, node_id: Uuid) -> Result<Vec<Uuid>, TaskAssignmentError> {
        let rows = sqlx::query(
            r#"
            UPDATE node_task_assignments
            SET execution_status = 'failed',
                completed_at = $2
            WHERE node_id = $1
              AND completed_at IS NULL
            RETURNING task_id
            "#,
        )
        .bind(node_id)
        .bind(Utc::now())
        .fetch_all(self.pool)
        .await?;

        Ok(rows.iter().map(|r| r.get("task_id")).collect())
    }
}
