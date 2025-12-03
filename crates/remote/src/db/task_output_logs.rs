//! Repository for task output logs from node execution.

use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum TaskOutputLogError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

/// A single output log entry from task execution.
#[derive(Debug, Clone, FromRow)]
pub struct TaskOutputLog {
    pub id: i64,
    pub assignment_id: Uuid,
    pub output_type: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

/// Data for creating a new output log entry.
pub struct CreateTaskOutputLog {
    pub assignment_id: Uuid,
    pub output_type: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
}

pub struct TaskOutputLogRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> TaskOutputLogRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    /// Create a new output log entry.
    pub async fn create(
        &self,
        data: CreateTaskOutputLog,
    ) -> Result<TaskOutputLog, TaskOutputLogError> {
        let log = sqlx::query_as::<_, TaskOutputLog>(
            r#"
            INSERT INTO node_task_output_logs (assignment_id, output_type, content, timestamp)
            VALUES ($1, $2, $3, $4)
            RETURNING id, assignment_id, output_type, content, timestamp, created_at
            "#,
        )
        .bind(data.assignment_id)
        .bind(&data.output_type)
        .bind(&data.content)
        .bind(data.timestamp)
        .fetch_one(self.pool)
        .await?;

        Ok(log)
    }

    /// Create multiple output log entries in a batch.
    pub async fn create_batch(
        &self,
        entries: Vec<CreateTaskOutputLog>,
    ) -> Result<(), TaskOutputLogError> {
        if entries.is_empty() {
            return Ok(());
        }

        // Build a batch insert query
        let mut query = String::from(
            "INSERT INTO node_task_output_logs (assignment_id, output_type, content, timestamp) VALUES ",
        );

        let mut params: Vec<String> = Vec::with_capacity(entries.len());
        for (i, _) in entries.iter().enumerate() {
            let base = i * 4;
            params.push(format!(
                "(${}, ${}, ${}, ${})",
                base + 1,
                base + 2,
                base + 3,
                base + 4
            ));
        }
        query.push_str(&params.join(", "));

        let mut query_builder = sqlx::query(&query);
        for entry in &entries {
            query_builder = query_builder
                .bind(entry.assignment_id)
                .bind(&entry.output_type)
                .bind(&entry.content)
                .bind(entry.timestamp);
        }

        query_builder.execute(self.pool).await?;

        Ok(())
    }

    /// Get output logs for an assignment.
    pub async fn list_by_assignment(
        &self,
        assignment_id: Uuid,
        limit: Option<i64>,
        after_id: Option<i64>,
    ) -> Result<Vec<TaskOutputLog>, TaskOutputLogError> {
        let limit = limit.unwrap_or(1000);

        let logs = if let Some(after_id) = after_id {
            sqlx::query_as::<_, TaskOutputLog>(
                r#"
                SELECT id, assignment_id, output_type, content, timestamp, created_at
                FROM node_task_output_logs
                WHERE assignment_id = $1
                  AND id > $2
                ORDER BY id ASC
                LIMIT $3
                "#,
            )
            .bind(assignment_id)
            .bind(after_id)
            .bind(limit)
            .fetch_all(self.pool)
            .await?
        } else {
            sqlx::query_as::<_, TaskOutputLog>(
                r#"
                SELECT id, assignment_id, output_type, content, timestamp, created_at
                FROM node_task_output_logs
                WHERE assignment_id = $1
                ORDER BY id ASC
                LIMIT $2
                "#,
            )
            .bind(assignment_id)
            .bind(limit)
            .fetch_all(self.pool)
            .await?
        };

        Ok(logs)
    }

    /// Get the latest output logs (most recent first) for an assignment.
    pub async fn list_latest_by_assignment(
        &self,
        assignment_id: Uuid,
        limit: i64,
    ) -> Result<Vec<TaskOutputLog>, TaskOutputLogError> {
        let logs = sqlx::query_as::<_, TaskOutputLog>(
            r#"
            SELECT id, assignment_id, output_type, content, timestamp, created_at
            FROM node_task_output_logs
            WHERE assignment_id = $1
            ORDER BY id DESC
            LIMIT $2
            "#,
        )
        .bind(assignment_id)
        .bind(limit)
        .fetch_all(self.pool)
        .await?;

        Ok(logs)
    }

    /// Get the count of output logs for an assignment.
    pub async fn count_by_assignment(
        &self,
        assignment_id: Uuid,
    ) -> Result<i64, TaskOutputLogError> {
        let row: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*) as count
            FROM node_task_output_logs
            WHERE assignment_id = $1
            "#,
        )
        .bind(assignment_id)
        .fetch_one(self.pool)
        .await?;

        Ok(row.0)
    }

    /// Delete output logs for an assignment.
    pub async fn delete_by_assignment(
        &self,
        assignment_id: Uuid,
    ) -> Result<u64, TaskOutputLogError> {
        let result = sqlx::query(
            r#"
            DELETE FROM node_task_output_logs
            WHERE assignment_id = $1
            "#,
        )
        .bind(assignment_id)
        .execute(self.pool)
        .await?;

        Ok(result.rows_affected())
    }
}
