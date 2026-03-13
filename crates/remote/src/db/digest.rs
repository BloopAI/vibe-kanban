use api_types::{NotificationPayload, NotificationType};
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::digest::DigestUser;

#[derive(Debug, Clone)]
pub struct NotificationDigestRow {
    pub id: Uuid,
    pub notification_type: NotificationType,
    pub payload: sqlx::types::Json<NotificationPayload>,
    pub issue_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub actor_name: String,
}

pub struct DigestRepository;

impl DigestRepository {
    pub async fn fetch_users_with_pending_notifications(
        pool: &PgPool,
        window_start: DateTime<Utc>,
        window_end: DateTime<Utc>,
    ) -> Result<Vec<DigestUser>, sqlx::Error> {
        sqlx::query_as!(
            DigestUser,
            r#"
            SELECT DISTINCT
                u.id AS "id!: Uuid",
                u.email AS "email!",
                u.first_name
                ,
                u.username
            FROM notifications n
            JOIN users u ON u.id = n.user_id
            WHERE n.created_at >= $1
              AND n.created_at < $2
              AND n.dismissed_at IS NULL
              AND n.seen = FALSE
              AND NOT EXISTS (
                  SELECT 1
                  FROM notification_digest_deliveries d
                  WHERE d.notification_id = n.id
              )
            ORDER BY u.id
            "#,
            window_start,
            window_end
        )
        .fetch_all(pool)
        .await
    }

    pub async fn fetch_notifications_for_user(
        pool: &PgPool,
        user_id: Uuid,
        window_start: DateTime<Utc>,
        window_end: DateTime<Utc>,
    ) -> Result<Vec<NotificationDigestRow>, sqlx::Error> {
        sqlx::query_as!(
            NotificationDigestRow,
            r#"
            SELECT
                n.id AS "id!: Uuid",
                n.notification_type AS "notification_type!: NotificationType",
                n.payload AS "payload!: sqlx::types::Json<NotificationPayload>",
                n.issue_id AS "issue_id?: Uuid",
                n.created_at AS "created_at!",
                COALESCE(NULLIF(actor.first_name, ''), NULLIF(actor.username, ''), 'Someone') AS "actor_name!"
            FROM notifications n
            LEFT JOIN users actor
                ON actor.id = NULLIF(n.payload->>'actor_user_id', '')::uuid
            WHERE n.user_id = $1
              AND n.created_at >= $2
              AND n.created_at < $3
              AND n.dismissed_at IS NULL
              AND n.seen = FALSE
              AND NOT EXISTS (
                  SELECT 1
                  FROM notification_digest_deliveries d
                  WHERE d.notification_id = n.id
              )
            ORDER BY n.created_at DESC
            "#,
            user_id,
            window_start,
            window_end
        )
        .fetch_all(pool)
        .await
    }

    pub async fn record_notifications_delivered(
        pool: &PgPool,
        user_id: Uuid,
        notification_ids: &[Uuid],
    ) -> Result<(), sqlx::Error> {
        if notification_ids.is_empty() {
            return Ok(());
        }

        sqlx::query!(
            r#"
            INSERT INTO notification_digest_deliveries (notification_id, user_id)
            SELECT notification_id, $2
            FROM UNNEST($1::uuid[]) AS delivered(notification_id)
            ON CONFLICT (notification_id) DO NOTHING
            "#,
            notification_ids,
            user_id,
        )
        .execute(pool)
        .await?;

        Ok(())
    }
}
