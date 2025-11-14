use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Executor, FromRow, QueryBuilder, Sqlite, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

use super::task::TaskStatus;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct SharedTask {
    pub id: Uuid,
    pub remote_project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub assignee_user_id: Option<Uuid>,
    pub assignee_first_name: Option<String>,
    pub assignee_last_name: Option<String>,
    pub assignee_username: Option<String>,
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
    pub remote_project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub assignee_user_id: Option<Uuid>,
    pub assignee_first_name: Option<String>,
    pub assignee_last_name: Option<String>,
    pub assignee_username: Option<String>,
    pub version: i64,
    pub last_event_seq: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl SharedTask {
    pub async fn list_by_remote_project_id(
        pool: &SqlitePool,
        remote_project_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            SharedTask,
            r#"
            SELECT
                id                         AS "id!: Uuid",
                remote_project_id          AS "remote_project_id!: Uuid",
                title                      AS title,
                description                AS description,
                status                     AS "status!: TaskStatus",
                assignee_user_id           AS "assignee_user_id: Uuid",
                assignee_first_name        AS "assignee_first_name: String",
                assignee_last_name         AS "assignee_last_name: String",
                assignee_username          AS "assignee_username: String",
                version                    AS "version!: i64",
                last_event_seq             AS "last_event_seq: i64",
                created_at                 AS "created_at!: DateTime<Utc>",
                updated_at                 AS "updated_at!: DateTime<Utc>"
            FROM shared_tasks
            WHERE remote_project_id = $1
            ORDER BY updated_at DESC
            "#,
            remote_project_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn upsert<'e, E>(executor: E, data: SharedTaskInput) -> Result<Self, sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        let status = data.status.clone();
        sqlx::query_as!(
            SharedTask,
            r#"
            INSERT INTO shared_tasks (
                id,
                remote_project_id,
                title,
                description,
                status,
                assignee_user_id,
                assignee_first_name,
                assignee_last_name,
                assignee_username,
                version,
                last_event_seq,
                created_at,
                updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
            )
            ON CONFLICT(id) DO UPDATE SET
                remote_project_id   = excluded.remote_project_id,
                title               = excluded.title,
                description         = excluded.description,
                status              = excluded.status,
                assignee_user_id    = excluded.assignee_user_id,
                assignee_first_name = excluded.assignee_first_name,
                assignee_last_name  = excluded.assignee_last_name,
                assignee_username   = excluded.assignee_username,
                version             = excluded.version,
                last_event_seq      = excluded.last_event_seq,
                created_at          = excluded.created_at,
                updated_at          = excluded.updated_at
            RETURNING
                id                         AS "id!: Uuid",
                remote_project_id          AS "remote_project_id!: Uuid",
                title                      AS title,
                description                AS description,
                status                     AS "status!: TaskStatus",
                assignee_user_id           AS "assignee_user_id: Uuid",
                assignee_first_name        AS "assignee_first_name: String",
                assignee_last_name         AS "assignee_last_name: String",
                assignee_username          AS "assignee_username: String",
                version                    AS "version!: i64",
                last_event_seq             AS "last_event_seq: i64",
                created_at                 AS "created_at!: DateTime<Utc>",
                updated_at                 AS "updated_at!: DateTime<Utc>"
            "#,
            data.id,
            data.remote_project_id,
            data.title,
            data.description,
            status,
            data.assignee_user_id,
            data.assignee_first_name,
            data.assignee_last_name,
            data.assignee_username,
            data.version,
            data.last_event_seq,
            data.created_at,
            data.updated_at
        )
        .fetch_one(executor)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            SharedTask,
            r#"
            SELECT
                id                         AS "id!: Uuid",
                remote_project_id          AS "remote_project_id!: Uuid",
                title                      AS title,
                description                AS description,
                status                     AS "status!: TaskStatus",
                assignee_user_id           AS "assignee_user_id: Uuid",
                assignee_first_name        AS "assignee_first_name: String",
                assignee_last_name         AS "assignee_last_name: String",
                assignee_username          AS "assignee_username: String",
                version                    AS "version!: i64",
                last_event_seq             AS "last_event_seq: i64",
                created_at                 AS "created_at!: DateTime<Utc>",
                updated_at                 AS "updated_at!: DateTime<Utc>"
            FROM shared_tasks
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn remove<'e, E>(executor: E, id: Uuid) -> Result<(), sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        sqlx::query!("DELETE FROM shared_tasks WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(())
    }

    pub async fn remove_many<'e, E>(executor: E, ids: &[Uuid]) -> Result<(), sqlx::Error>
    where
        E: Executor<'e, Database = Sqlite>,
    {
        if ids.is_empty() {
            return Ok(());
        }

        let mut builder = QueryBuilder::<Sqlite>::new("DELETE FROM shared_tasks WHERE id IN (");
        {
            let mut separated = builder.separated(", ");
            for id in ids {
                separated.push_bind(id);
            }
        }
        builder.push(")");
        builder.build().execute(executor).await?;
        Ok(())
    }

    pub async fn find_by_rowid(pool: &SqlitePool, rowid: i64) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            SharedTask,
            r#"
            SELECT
                id                         AS "id!: Uuid",
                remote_project_id          AS "remote_project_id!: Uuid",
                title                      AS title,
                description                AS description,
                status                     AS "status!: TaskStatus",
                assignee_user_id           AS "assignee_user_id: Uuid",
                assignee_first_name        AS "assignee_first_name: String",
                assignee_last_name         AS "assignee_last_name: String",
                assignee_username          AS "assignee_username: String",
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
