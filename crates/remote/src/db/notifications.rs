use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Executor, Postgres, Type};
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, TS)]
#[sqlx(type_name = "notification_type", rename_all = "snake_case")]
#[ts(export)]
pub enum NotificationType {
    IssueCommentAdded,
    IssueStatusChanged,
    IssueAssigneeChanged,
    IssueDeleted,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Notification {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub notification_type: NotificationType,
    pub payload: Value,
    pub issue_id: Option<Uuid>,
    pub comment_id: Option<Uuid>,
    pub seen: bool,
    pub dismissed_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Error)]
pub enum NotificationError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct NotificationRepository;

impl NotificationRepository {
    pub async fn find_by_id<'e, E>(
        executor: E,
        id: Uuid,
    ) -> Result<Option<Notification>, NotificationError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            Notification,
            r#"
            SELECT
                id                AS "id!: Uuid",
                organization_id   AS "organization_id!: Uuid",
                user_id           AS "user_id!: Uuid",
                notification_type AS "notification_type!: NotificationType",
                payload           AS "payload!: Value",
                issue_id          AS "issue_id: Uuid",
                comment_id        AS "comment_id: Uuid",
                seen              AS "seen!",
                dismissed_at      AS "dismissed_at: DateTime<Utc>",
                created_at        AS "created_at!: DateTime<Utc>"
            FROM notifications
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record)
    }

    pub async fn create<'e, E>(
        executor: E,
        organization_id: Uuid,
        user_id: Uuid,
        notification_type: NotificationType,
        payload: Value,
        issue_id: Option<Uuid>,
        comment_id: Option<Uuid>,
    ) -> Result<Notification, NotificationError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = Uuid::new_v4();
        let now = Utc::now();
        let record = sqlx::query_as!(
            Notification,
            r#"
            INSERT INTO notifications (id, organization_id, user_id, notification_type, payload, issue_id, comment_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING
                id                AS "id!: Uuid",
                organization_id   AS "organization_id!: Uuid",
                user_id           AS "user_id!: Uuid",
                notification_type AS "notification_type!: NotificationType",
                payload           AS "payload!: Value",
                issue_id          AS "issue_id: Uuid",
                comment_id        AS "comment_id: Uuid",
                seen              AS "seen!",
                dismissed_at      AS "dismissed_at: DateTime<Utc>",
                created_at        AS "created_at!: DateTime<Utc>"
            "#,
            id,
            organization_id,
            user_id,
            notification_type as NotificationType,
            payload,
            issue_id,
            comment_id,
            now
        )
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn list_by_user<'e, E>(
        executor: E,
        user_id: Uuid,
        include_dismissed: bool,
    ) -> Result<Vec<Notification>, NotificationError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let records = if include_dismissed {
            sqlx::query_as!(
                Notification,
                r#"
                SELECT
                    id                AS "id!: Uuid",
                    organization_id   AS "organization_id!: Uuid",
                    user_id           AS "user_id!: Uuid",
                    notification_type AS "notification_type!: NotificationType",
                    payload           AS "payload!: Value",
                    issue_id          AS "issue_id: Uuid",
                    comment_id        AS "comment_id: Uuid",
                    seen              AS "seen!",
                    dismissed_at      AS "dismissed_at: DateTime<Utc>",
                    created_at        AS "created_at!: DateTime<Utc>"
                FROM notifications
                WHERE user_id = $1
                ORDER BY created_at DESC
                "#,
                user_id
            )
            .fetch_all(executor)
            .await?
        } else {
            sqlx::query_as!(
                Notification,
                r#"
                SELECT
                    id                AS "id!: Uuid",
                    organization_id   AS "organization_id!: Uuid",
                    user_id           AS "user_id!: Uuid",
                    notification_type AS "notification_type!: NotificationType",
                    payload           AS "payload!: Value",
                    issue_id          AS "issue_id: Uuid",
                    comment_id        AS "comment_id: Uuid",
                    seen              AS "seen!",
                    dismissed_at      AS "dismissed_at: DateTime<Utc>",
                    created_at        AS "created_at!: DateTime<Utc>"
                FROM notifications
                WHERE user_id = $1 AND dismissed_at IS NULL
                ORDER BY created_at DESC
                "#,
                user_id
            )
            .fetch_all(executor)
            .await?
        };

        Ok(records)
    }

    pub async fn mark_seen<'e, E>(executor: E, id: Uuid) -> Result<Notification, NotificationError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            Notification,
            r#"
            UPDATE notifications
            SET seen = TRUE
            WHERE id = $1
            RETURNING
                id                AS "id!: Uuid",
                organization_id   AS "organization_id!: Uuid",
                user_id           AS "user_id!: Uuid",
                notification_type AS "notification_type!: NotificationType",
                payload           AS "payload!: Value",
                issue_id          AS "issue_id: Uuid",
                comment_id        AS "comment_id: Uuid",
                seen              AS "seen!",
                dismissed_at      AS "dismissed_at: DateTime<Utc>",
                created_at        AS "created_at!: DateTime<Utc>"
            "#,
            id
        )
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn mark_all_seen<'e, E>(executor: E, user_id: Uuid) -> Result<u64, NotificationError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let result = sqlx::query!(
            "UPDATE notifications SET seen = TRUE WHERE user_id = $1 AND seen = FALSE",
            user_id
        )
        .execute(executor)
        .await?;

        Ok(result.rows_affected())
    }

    pub async fn dismiss<'e, E>(executor: E, id: Uuid) -> Result<Notification, NotificationError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let now = Utc::now();
        let record = sqlx::query_as!(
            Notification,
            r#"
            UPDATE notifications
            SET dismissed_at = $1
            WHERE id = $2
            RETURNING
                id                AS "id!: Uuid",
                organization_id   AS "organization_id!: Uuid",
                user_id           AS "user_id!: Uuid",
                notification_type AS "notification_type!: NotificationType",
                payload           AS "payload!: Value",
                issue_id          AS "issue_id: Uuid",
                comment_id        AS "comment_id: Uuid",
                seen              AS "seen!",
                dismissed_at      AS "dismissed_at: DateTime<Utc>",
                created_at        AS "created_at!: DateTime<Utc>"
            "#,
            now,
            id
        )
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn unread_count<'e, E>(executor: E, user_id: Uuid) -> Result<i64, NotificationError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let result = sqlx::query_scalar!(
            "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND seen = FALSE AND dismissed_at IS NULL",
            user_id
        )
        .fetch_one(executor)
        .await?;

        Ok(result.unwrap_or(0))
    }

    /// Update a notification with partial fields. Uses COALESCE to preserve existing values
    /// when None is provided. Automatically sets `dismissed_at` when `seen` is set to true.
    pub async fn update<'e, E>(
        executor: E,
        id: Uuid,
        seen: Option<bool>,
    ) -> Result<Notification, NotificationError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            Notification,
            r#"
            UPDATE notifications
            SET seen = COALESCE($1, seen),
                dismissed_at = CASE
                    WHEN $1 = true AND dismissed_at IS NULL THEN NOW()
                    ELSE dismissed_at
                END
            WHERE id = $2
            RETURNING
                id                AS "id!: Uuid",
                organization_id   AS "organization_id!: Uuid",
                user_id           AS "user_id!: Uuid",
                notification_type AS "notification_type!: NotificationType",
                payload           AS "payload!: Value",
                issue_id          AS "issue_id: Uuid",
                comment_id        AS "comment_id: Uuid",
                seen              AS "seen!",
                dismissed_at      AS "dismissed_at: DateTime<Utc>",
                created_at        AS "created_at!: DateTime<Utc>"
            "#,
            seen,
            id
        )
        .fetch_one(executor)
        .await?;

        Ok(record)
    }

    pub async fn delete<'e, E>(executor: E, id: Uuid) -> Result<(), NotificationError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        sqlx::query!("DELETE FROM notifications WHERE id = $1", id)
            .execute(executor)
            .await?;
        Ok(())
    }
}
