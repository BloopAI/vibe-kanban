use api_types::{NotificationPayload, NotificationType};
use chrono::{DateTime, NaiveDate, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::digest::DigestUser;

#[derive(Debug, Clone)]
pub struct NotificationDigestRow {
    pub notification_type: NotificationType,
    pub payload: sqlx::types::Json<NotificationPayload>,
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
                n.notification_type AS "notification_type!: NotificationType",
                n.payload AS "payload!: sqlx::types::Json<NotificationPayload>",
                COALESCE(NULLIF(actor.first_name, ''), NULLIF(actor.username, ''), 'Someone') AS "actor_name!"
            FROM notifications n
            LEFT JOIN users actor
                ON actor.id = NULLIF(n.payload->>'actor_user_id', '')::uuid
            WHERE n.user_id = $1
              AND n.created_at >= $2
              AND n.created_at < $3
              AND n.dismissed_at IS NULL
              AND n.seen = FALSE
            ORDER BY n.created_at DESC
            "#,
            user_id,
            window_start,
            window_end
        )
        .fetch_all(pool)
        .await
    }

    pub async fn try_record_digest_sent(
        pool: &PgPool,
        user_id: Uuid,
        digest_date: NaiveDate,
        notification_count: i32,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query!(
            r#"
            INSERT INTO notification_digest_log (user_id, digest_date, notification_count)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, digest_date) DO NOTHING
            "#,
            user_id,
            digest_date,
            notification_count
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn delete_digest_record(
        pool: &PgPool,
        user_id: Uuid,
        digest_date: NaiveDate,
    ) -> Result<(), sqlx::Error> {
        sqlx::query!(
            r#"
            DELETE FROM notification_digest_log
            WHERE user_id = $1
              AND digest_date = $2
            "#,
            user_id,
            digest_date
        )
        .execute(pool)
        .await?;

        Ok(())
    }
}
