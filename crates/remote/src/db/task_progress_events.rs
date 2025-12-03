//! Repository for task progress events from node execution.

use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum TaskProgressEventError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

/// A single progress event from task execution.
#[derive(Debug, Clone, FromRow)]
pub struct TaskProgressEvent {
    pub id: i64,
    pub assignment_id: Uuid,
    pub event_type: String,
    pub message: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub timestamp: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

/// Data for creating a new progress event.
pub struct CreateTaskProgressEvent {
    pub assignment_id: Uuid,
    pub event_type: String,
    pub message: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub timestamp: DateTime<Utc>,
}

pub struct TaskProgressEventRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> TaskProgressEventRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    /// Create a new progress event.
    pub async fn create(
        &self,
        data: CreateTaskProgressEvent,
    ) -> Result<TaskProgressEvent, TaskProgressEventError> {
        let event = sqlx::query_as::<_, TaskProgressEvent>(
            r#"
            INSERT INTO node_task_progress_events (assignment_id, event_type, message, metadata, timestamp)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, assignment_id, event_type, message, metadata, timestamp, created_at
            "#,
        )
        .bind(data.assignment_id)
        .bind(&data.event_type)
        .bind(&data.message)
        .bind(&data.metadata)
        .bind(data.timestamp)
        .fetch_one(self.pool)
        .await?;

        Ok(event)
    }

    /// Get progress events for an assignment.
    pub async fn list_by_assignment(
        &self,
        assignment_id: Uuid,
        limit: Option<i64>,
    ) -> Result<Vec<TaskProgressEvent>, TaskProgressEventError> {
        let limit = limit.unwrap_or(100);

        let events = sqlx::query_as::<_, TaskProgressEvent>(
            r#"
            SELECT id, assignment_id, event_type, message, metadata, timestamp, created_at
            FROM node_task_progress_events
            WHERE assignment_id = $1
            ORDER BY timestamp ASC
            LIMIT $2
            "#,
        )
        .bind(assignment_id)
        .bind(limit)
        .fetch_all(self.pool)
        .await?;

        Ok(events)
    }

    /// Get the latest progress event for an assignment.
    pub async fn get_latest(
        &self,
        assignment_id: Uuid,
    ) -> Result<Option<TaskProgressEvent>, TaskProgressEventError> {
        let event = sqlx::query_as::<_, TaskProgressEvent>(
            r#"
            SELECT id, assignment_id, event_type, message, metadata, timestamp, created_at
            FROM node_task_progress_events
            WHERE assignment_id = $1
            ORDER BY timestamp DESC
            LIMIT 1
            "#,
        )
        .bind(assignment_id)
        .fetch_optional(self.pool)
        .await?;

        Ok(event)
    }

    /// Get the count of progress events for an assignment.
    pub async fn count_by_assignment(
        &self,
        assignment_id: Uuid,
    ) -> Result<i64, TaskProgressEventError> {
        let row: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*) as count
            FROM node_task_progress_events
            WHERE assignment_id = $1
            "#,
        )
        .bind(assignment_id)
        .fetch_one(self.pool)
        .await?;

        Ok(row.0)
    }

    /// Delete progress events for an assignment.
    pub async fn delete_by_assignment(
        &self,
        assignment_id: Uuid,
    ) -> Result<u64, TaskProgressEventError> {
        let result = sqlx::query(
            r#"
            DELETE FROM node_task_progress_events
            WHERE assignment_id = $1
            "#,
        )
        .bind(assignment_id)
        .execute(self.pool)
        .await?;

        Ok(result.rows_affected())
    }
}
