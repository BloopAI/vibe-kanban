use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct Merge {
    pub id: Uuid,
    pub task_attempt_id: Uuid,
    pub merge_commit: String,
    pub merged_at: DateTime<Utc>,
}

impl Merge {
    /// Create a new merge record
    pub async fn create(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
        merge_commit: &str,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let merge = sqlx::query_as!(
            Merge,
            r#"INSERT INTO merges (id, task_attempt_id, merge_commit) 
               VALUES ($1, $2, $3)
               RETURNING 
                   id as "id!: Uuid",
                   task_attempt_id as "task_attempt_id!: Uuid",
                   merge_commit as "merge_commit!",
                   merged_at as "merged_at!: DateTime<Utc>""#,
            id,
            task_attempt_id,
            merge_commit
        )
        .fetch_one(pool)
        .await?;

        Ok(merge)
    }

    /// Find all merges for a task attempt
    pub async fn find_by_task_attempt_id(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            Merge,
            r#"SELECT 
                id as "id!: Uuid",
                task_attempt_id as "task_attempt_id!: Uuid",
                merge_commit as "merge_commit!",
                merged_at as "merged_at!: DateTime<Utc>"
               FROM merges 
               WHERE task_attempt_id = $1 
               ORDER BY merged_at DESC"#,
            task_attempt_id
        )
        .fetch_all(pool)
        .await
    }

    /// Find the most recent merge for a task attempt
    pub async fn find_latest_by_task_attempt_id(
        pool: &SqlitePool,
        task_attempt_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            Merge,
            r#"SELECT 
                id as "id!: Uuid",
                task_attempt_id as "task_attempt_id!: Uuid",
                merge_commit as "merge_commit!",
                merged_at as "merged_at!: DateTime<Utc>"
               FROM merges 
               WHERE task_attempt_id = $1 
               ORDER BY merged_at DESC
               LIMIT 1"#,
            task_attempt_id
        )
        .fetch_optional(pool)
        .await
    }
}
