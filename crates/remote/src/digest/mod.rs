pub mod email;
pub mod task;

use std::time::Duration;

use chrono::{DateTime, Utc};
use sqlx::PgPool;
use thiserror::Error;
use tracing::{info, warn};

use crate::{
    db::digest::DigestRepository,
    mail::{DIGEST_PREVIEW_COUNT, DigestContact, Mailer},
};

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct DigestUser {
    pub id: uuid::Uuid,
    pub email: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub username: Option<String>,
}

#[derive(Debug, Default)]
pub struct DigestStats {
    pub users_processed: u32,
    pub emails_sent: u32,
    pub errors: u32,
}

#[derive(Debug, Error)]
pub enum DigestError {
    #[error("digest database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("loops event failed for digest: status={status}, body={body}")]
    LoopsSendFailed {
        status: reqwest::StatusCode,
        body: String,
    },
    #[error("loops request error for digest: {0}")]
    LoopsRequest(#[from] reqwest::Error),
    #[error("invalid digest window duration")]
    InvalidWindowDuration,
}

pub async fn run_email_digest(
    pool: &PgPool,
    mailer: &dyn Mailer,
    base_url: &str,
    now: DateTime<Utc>,
    window: Duration,
    send_delay: Duration,
) -> Result<DigestStats, DigestError> {
    let (window_start, window_end) = digest_window(now, window)?;
    let mut stats = DigestStats::default();

    let users =
        DigestRepository::fetch_users_with_pending_notifications(pool, window_start, window_end)
            .await?;

    info!(
        window_start = %window_start,
        window_end = %window_end,
        user_count = users.len(),
        "Digest: found users with pending notifications"
    );

    for user in &users {
        stats.users_processed += 1;

        match process_user_digest(pool, mailer, base_url, user, window_start, window_end).await {
            Ok(sent) => stats.emails_sent += sent,
            Err(e) => {
                warn!(user_id = %user.id, error = %e, "Digest: failed to process user");
                stats.errors += 1;
            }
        }

        if !send_delay.is_zero() {
            tokio::time::sleep(send_delay).await;
        }
    }

    Ok(stats)
}

async fn process_user_digest(
    pool: &PgPool,
    mailer: &dyn Mailer,
    base_url: &str,
    user: &DigestUser,
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
) -> Result<u32, DigestError> {
    let notification_rows =
        DigestRepository::fetch_notifications_for_user(pool, user.id, window_start, window_end)
            .await?;

    if notification_rows.len() < DIGEST_PREVIEW_COUNT {
        return Ok(0);
    }

    let total_count = notification_rows.len() as i32;
    let notification_ids = notification_rows
        .iter()
        .map(|row| row.id)
        .collect::<Vec<_>>();

    let items = email::build_digest_items(&notification_rows, base_url);
    let notifications_url = email::notifications_url(base_url);
    let contact = DigestContact {
        email: &user.email,
        user_id: &user.id.to_string(),
        first_name: user.first_name.as_deref(),
        last_name: user.last_name.as_deref(),
    };

    mailer
        .send_digest_event(&contact, total_count, &items, &notifications_url)
        .await?;

    DigestRepository::record_notifications_delivered(pool, &notification_ids).await?;

    Ok(1)
}

fn digest_window(
    now: DateTime<Utc>,
    window: Duration,
) -> Result<(DateTime<Utc>, DateTime<Utc>), DigestError> {
    let lookback =
        chrono::Duration::from_std(window).map_err(|_| DigestError::InvalidWindowDuration)?;
    let window_end = now;
    let window_start = window_end - lookback;

    Ok((window_start, window_end))
}
