use api_types::{Notification, NotificationPayload, NotificationType};
use chrono::{DateTime, Utc};
use sqlx::{Executor, FromRow, Postgres};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum NotificationError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, FromRow)]
struct NotificationRow {
    id: Uuid,
    organization_id: Uuid,
    user_id: Uuid,
    notification_type: NotificationType,
    payload: sqlx::types::Json<NotificationPayload>,
    issue_id: Option<Uuid>,
    comment_id: Option<Uuid>,
    seen: bool,
    dismissed_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

impl From<NotificationRow> for Notification {
    fn from(row: NotificationRow) -> Self {
        Self {
            id: row.id,
            organization_id: row.organization_id,
            user_id: row.user_id,
            notification_type: row.notification_type,
            payload: row.payload.0,
            issue_id: row.issue_id,
            comment_id: row.comment_id,
            seen: row.seen,
            dismissed_at: row.dismissed_at,
            created_at: row.created_at,
        }
    }
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
            NotificationRow,
            r#"
            SELECT
                id,
                organization_id,
                user_id,
                notification_type as "notification_type!: NotificationType",
                payload as "payload!: sqlx::types::Json<NotificationPayload>",
                issue_id,
                comment_id,
                seen,
                dismissed_at,
                created_at
            FROM notifications
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(executor)
        .await?;

        Ok(record.map(Into::into))
    }

    pub async fn create<'e, E>(
        executor: E,
        organization_id: Uuid,
        user_id: Uuid,
        notification_type: NotificationType,
        payload: NotificationPayload,
        issue_id: Option<Uuid>,
        comment_id: Option<Uuid>,
    ) -> Result<Notification, NotificationError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = Uuid::new_v4();
        let now = Utc::now();
        let payload = sqlx::types::Json(payload);
        let record = sqlx::query_as!(
            NotificationRow,
            r#"
            INSERT INTO notifications (id, organization_id, user_id, notification_type, payload, issue_id, comment_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING
                id,
                organization_id,
                user_id,
                notification_type as "notification_type!: NotificationType",
                payload as "payload!: sqlx::types::Json<NotificationPayload>",
                issue_id,
                comment_id,
                seen,
                dismissed_at,
                created_at
            "#,
            id,
            organization_id,
            user_id,
            notification_type as NotificationType,
            payload as sqlx::types::Json<NotificationPayload>,
            issue_id,
            comment_id,
            now
        )
        .fetch_one(executor)
        .await?;

        Ok(record.into())
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
                NotificationRow,
                r#"
                SELECT
                    id,
                    organization_id,
                    user_id,
                    notification_type as "notification_type!: NotificationType",
                    payload as "payload!: sqlx::types::Json<NotificationPayload>",
                    issue_id,
                    comment_id,
                    seen,
                    dismissed_at,
                    created_at
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
                NotificationRow,
                r#"
                SELECT
                    id,
                    organization_id,
                    user_id,
                    notification_type as "notification_type!: NotificationType",
                    payload as "payload!: sqlx::types::Json<NotificationPayload>",
                    issue_id,
                    comment_id,
                    seen,
                    dismissed_at,
                    created_at
                FROM notifications
                WHERE user_id = $1 AND dismissed_at IS NULL
                ORDER BY created_at DESC
                "#,
                user_id
            )
            .fetch_all(executor)
            .await?
        };

        Ok(records.into_iter().map(Into::into).collect())
    }

    pub async fn update<'e, E>(
        executor: E,
        id: Uuid,
        seen: Option<bool>,
    ) -> Result<Notification, NotificationError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let record = sqlx::query_as!(
            NotificationRow,
            r#"
            UPDATE notifications
            SET seen = COALESCE($1, seen),
                dismissed_at = CASE
                    WHEN $1 = true AND dismissed_at IS NULL THEN NOW()
                    ELSE dismissed_at
                END
            WHERE id = $2
            RETURNING
                id,
                organization_id,
                user_id,
                notification_type as "notification_type!: NotificationType",
                payload as "payload!: sqlx::types::Json<NotificationPayload>",
                issue_id,
                comment_id,
                seen,
                dismissed_at,
                created_at
            "#,
            seen,
            id
        )
        .fetch_one(executor)
        .await?;

        Ok(record.into())
    }

    pub async fn upsert_recent<'e, E>(
        executor: E,
        organization_id: Uuid,
        user_id: Uuid,
        notification_type: NotificationType,
        payload: NotificationPayload,
        issue_id: Option<Uuid>,
        comment_id: Option<Uuid>,
    ) -> Result<Notification, NotificationError>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let id = Uuid::new_v4();
        let now = Utc::now();
        let payload = sqlx::types::Json(payload);
        let record: NotificationRow = sqlx::query_as!(
            NotificationRow,
            r#"
            WITH existing AS (
                SELECT id FROM notifications
                WHERE user_id = $3
                  AND notification_type = $4
                  AND issue_id IS NOT DISTINCT FROM $6
                  AND comment_id IS NOT DISTINCT FROM $7
                  AND created_at > NOW() - INTERVAL '1 minute'
                ORDER BY created_at DESC
                LIMIT 1
            ),
            updated AS (
                UPDATE notifications
                SET payload = $5,
                    seen = FALSE,
                    dismissed_at = NULL,
                    created_at = $8
                WHERE id = (SELECT id FROM existing)
                RETURNING
                    id,
                    organization_id,
                    user_id,
                    notification_type,
                    payload,
                    issue_id,
                    comment_id,
                    seen,
                    dismissed_at,
                    created_at
            ),
            inserted AS (
                INSERT INTO notifications (id, organization_id, user_id, notification_type, payload, issue_id, comment_id, created_at)
                SELECT $1, $2, $3, $4, $5, $6, $7, $8
                WHERE NOT EXISTS (SELECT 1 FROM existing)
                RETURNING
                    id,
                    organization_id,
                    user_id,
                    notification_type,
                    payload,
                    issue_id,
                    comment_id,
                    seen,
                    dismissed_at,
                    created_at
            )
            SELECT
                id as "id!",
                organization_id as "organization_id!",
                user_id as "user_id!",
                notification_type as "notification_type!: NotificationType",
                payload as "payload!: sqlx::types::Json<NotificationPayload>",
                issue_id,
                comment_id,
                seen as "seen!",
                dismissed_at,
                created_at as "created_at!"
            FROM updated
            UNION ALL
            SELECT
                id as "id!",
                organization_id as "organization_id!",
                user_id as "user_id!",
                notification_type as "notification_type!: NotificationType",
                payload as "payload!: sqlx::types::Json<NotificationPayload>",
                issue_id,
                comment_id,
                seen as "seen!",
                dismissed_at,
                created_at as "created_at!"
            FROM inserted
            "#,
            id,
            organization_id,
            user_id,
            notification_type as NotificationType,
            payload as sqlx::types::Json<NotificationPayload>,
            issue_id,
            comment_id,
            now
        )
        .fetch_one(executor)
        .await?;

        Ok(record.into())
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
