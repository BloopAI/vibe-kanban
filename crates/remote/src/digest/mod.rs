pub mod email;
pub mod task;

use chrono::{DateTime, Days, NaiveDate, Utc};
use sqlx::PgPool;
use tracing::{info, warn};

use crate::{db::digest::DigestRepository, mail::Mailer};

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct DigestUser {
    pub id: uuid::Uuid,
    pub email: String,
    pub first_name: Option<String>,
    pub username: Option<String>,
}

#[derive(Debug, Default)]
pub struct DigestStats {
    pub users_processed: u32,
    pub emails_sent: u32,
    pub errors: u32,
}

pub async fn run_daily_email_digest(
    pool: &PgPool,
    mailer: &dyn Mailer,
    base_url: &str,
    now: DateTime<Utc>,
) -> anyhow::Result<DigestStats> {
    let (digest_date, window_start, window_end) = digest_window(now)?;
    let mut stats = DigestStats::default();

    let users =
        DigestRepository::fetch_users_with_pending_notifications(pool, window_start, window_end)
            .await?;

    info!(
        digest_date = %digest_date,
        user_count = users.len(),
        "Digest: found users with pending notifications"
    );

    for user in &users {
        stats.users_processed += 1;

        match process_user_digest(
            pool,
            mailer,
            base_url,
            user,
            digest_date,
            window_start,
            window_end,
        )
        .await
        {
            Ok(sent) => stats.emails_sent += sent,
            Err(e) => {
                warn!(user_id = %user.id, error = %e, "Digest: failed to process user");
                stats.errors += 1;
            }
        }
    }

    Ok(stats)
}

async fn process_user_digest(
    pool: &PgPool,
    mailer: &dyn Mailer,
    base_url: &str,
    user: &DigestUser,
    digest_date: NaiveDate,
    window_start: DateTime<Utc>,
    window_end: DateTime<Utc>,
) -> anyhow::Result<u32> {
    let notification_rows =
        DigestRepository::fetch_notifications_for_user(pool, user.id, window_start, window_end)
            .await?;

    if notification_rows.is_empty() {
        return Ok(0);
    }

    let total_count = notification_rows.len() as i32;

    if !DigestRepository::try_record_digest_sent(pool, user.id, digest_date, total_count).await? {
        return Ok(0);
    }

    let name = email::recipient_name(user);
    let items = email::build_preview_items(&notification_rows, base_url);

    if let Err(error) = mailer
        .send_notification_digest(&user.email, &name, total_count, &items)
        .await
    {
        DigestRepository::delete_digest_record(pool, user.id, digest_date).await?;
        return Err(error);
    }

    Ok(1)
}

fn digest_window(now: DateTime<Utc>) -> anyhow::Result<(NaiveDate, DateTime<Utc>, DateTime<Utc>)> {
    let digest_date = now
        .date_naive()
        .checked_sub_days(Days::new(1))
        .ok_or_else(|| anyhow::anyhow!("failed to compute digest date"))?;
    let window_start = digest_date
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| anyhow::anyhow!("failed to compute digest window start"))?
        .and_utc();
    let window_end = window_start + chrono::Duration::days(1);

    Ok((digest_date, window_start, window_end))
}
