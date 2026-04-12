//! Activity cursor for tracking sync progress from the Hive.
//!
//! This module provides tracking for the activity stream position when syncing
//! label events from the Hive. Task sync is handled by ElectricSQL.

use chrono::{DateTime, Utc};
use sqlx::{Executor, FromRow, Sqlite, SqlitePool};
use uuid::Uuid;

/// Tracks the last processed activity sequence number for a remote project.
///
/// This is used to resume processing of label events from the Hive's activity
/// stream after disconnection or restart.
#[derive(Debug, Clone, FromRow)]
pub struct SharedActivityCursor {
    pub remote_project_id: Uuid,
    pub last_seq: i64,
    pub updated_at: DateTime<Utc>,
}

impl SharedActivityCursor {
    pub async fn get(
        pool: &SqlitePool,
        remote_project_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            SharedActivityCursor,
            r#"
            SELECT
                remote_project_id AS "remote_project_id!: Uuid",
                last_seq          AS "last_seq!: i64",
                updated_at        AS "updated_at!: DateTime<Utc>"
            FROM shared_activity_cursors
            WHERE remote_project_id = $1
            "#,
            remote_project_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn upsert<'e, E>(
        executor: E,
        remote_project_id: Uuid,
        last_seq: i64,
    ) -> Result<Self, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        sqlx::query_as!(
            SharedActivityCursor,
            r#"
            INSERT INTO shared_activity_cursors (
                remote_project_id,
                last_seq,
                updated_at
            )
            VALUES (
                $1,
                $2,
                datetime('now', 'subsec')
            )
            ON CONFLICT(remote_project_id) DO UPDATE SET
                last_seq   = excluded.last_seq,
                updated_at = excluded.updated_at
            RETURNING
                remote_project_id AS "remote_project_id!: Uuid",
                last_seq          AS "last_seq!: i64",
                updated_at        AS "updated_at!: DateTime<Utc>"
            "#,
            remote_project_id,
            last_seq
        )
        .fetch_one(executor)
        .await
    }
}
