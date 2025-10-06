use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

use super::task::TaskStatus;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct SharedTask {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub assignee_member_id: Option<Uuid>,
    pub version: i64,
    pub last_event_seq: Option<i64>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct SharedTaskInput {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub assignee_member_id: Option<Uuid>,
    pub version: i64,
    pub last_event_seq: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl SharedTask {
    pub async fn list(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            SharedTask,
            r#"
            SELECT
                id                         AS "id!: Uuid",
                organization_id            AS "organization_id!: Uuid",
                project_id                 AS "project_id!: Uuid",
                title                      AS title,
                description                AS description,
                status                     AS "status!: TaskStatus",
                assignee_member_id         AS "assignee_member_id: Uuid",
                version                    AS "version!: i64",
                last_event_seq             AS "last_event_seq: i64",
                created_at                 AS "created_at!: DateTime<Utc>",
                updated_at                 AS "updated_at!: DateTime<Utc>"
            FROM shared_tasks
            ORDER BY updated_at DESC
            "#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn upsert(pool: &SqlitePool, data: SharedTaskInput) -> Result<Self, sqlx::Error> {
        let status = data.status.clone();
        sqlx::query_as!(
            SharedTask,
            r#"
            INSERT INTO shared_tasks (
                id,
                organization_id,
                project_id,
                title,
                description,
                status,
                assignee_member_id,
                version,
                last_event_seq,
                created_at,
                updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
            )
            ON CONFLICT(id) DO UPDATE SET
                organization_id     = excluded.organization_id,
                project_id          = excluded.project_id,
                title               = excluded.title,
                description         = excluded.description,
                status              = excluded.status,
                assignee_member_id  = excluded.assignee_member_id,
                version             = excluded.version,
                last_event_seq      = excluded.last_event_seq,
                created_at          = excluded.created_at,
                updated_at          = excluded.updated_at
            RETURNING
                id                         AS "id!: Uuid",
                organization_id            AS "organization_id!: Uuid",
                project_id                 AS "project_id!: Uuid",
                title                      AS title,
                description                AS description,
                status                     AS "status!: TaskStatus",
                assignee_member_id         AS "assignee_member_id: Uuid",
                version                    AS "version!: i64",
                last_event_seq             AS "last_event_seq: i64",
                created_at                 AS "created_at!: DateTime<Utc>",
                updated_at                 AS "updated_at!: DateTime<Utc>"
            "#,
            data.id,
            data.organization_id,
            data.project_id,
            data.title,
            data.description,
            status,
            data.assignee_member_id,
            data.version,
            data.last_event_seq,
            data.created_at,
            data.updated_at
        )
        .fetch_one(pool)
        .await
    }

    pub async fn remove(pool: &SqlitePool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query!("DELETE FROM shared_tasks WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            SharedTask,
            r#"
            SELECT
                id                         AS "id!: Uuid",
                organization_id            AS "organization_id!: Uuid",
                project_id                 AS "project_id!: Uuid",
                title                      AS title,
                description                AS description,
                status                     AS "status!: TaskStatus",
                assignee_member_id         AS "assignee_member_id: Uuid",
                version                    AS "version!: i64",
                last_event_seq             AS "last_event_seq: i64",
                created_at                 AS "created_at!: DateTime<Utc>",
                updated_at                 AS "updated_at!: DateTime<Utc>"
            FROM shared_tasks
            WHERE rowid = $1
            "#,
            rowid
        )
        .fetch_optional(pool)
        .await
    }
}

#[derive(Debug, Clone, FromRow)]
pub struct SharedActivityCursor {
    pub organization_id: Uuid,
    pub last_seq: i64,
    pub updated_at: DateTime<Utc>,
}

impl SharedActivityCursor {
    pub async fn get(
        pool: &SqlitePool,
        organization_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            SharedActivityCursor,
            r#"
            SELECT
                organization_id AS "organization_id!: Uuid",
                last_seq        AS "last_seq!: i64",
                updated_at      AS "updated_at!: DateTime<Utc>"
            FROM shared_activity_cursors
            WHERE organization_id = $1
            "#,
            organization_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn upsert(
        pool: &SqlitePool,
        organization_id: Uuid,
        last_seq: i64,
    ) -> Result<Self, sqlx::Error> {
        sqlx::query_as!(
            SharedActivityCursor,
            r#"
            INSERT INTO shared_activity_cursors (
                organization_id,
                last_seq,
                updated_at
            )
            VALUES (
                $1,
                $2,
                datetime('now', 'subsec')
            )
            ON CONFLICT(organization_id) DO UPDATE SET
                last_seq   = excluded.last_seq,
                updated_at = excluded.updated_at
            RETURNING
                organization_id AS "organization_id!: Uuid",
                last_seq        AS "last_seq!: i64",
                updated_at      AS "updated_at!: DateTime<Utc>"
            "#,
            organization_id,
            last_seq
        )
        .fetch_one(pool)
        .await
    }
}
