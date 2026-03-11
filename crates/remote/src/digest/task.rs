use std::{sync::Arc, time::Duration};

use chrono::Utc;
use sqlx::PgPool;
use tokio::task::JoinHandle;
use tracing::{error, info};

use crate::{digest::run_daily_email_digest, mail::Mailer};

const DEFAULT_INTERVAL: Duration = Duration::from_secs(86400);

pub fn spawn_digest_task(
    pool: PgPool,
    mailer: Arc<dyn Mailer>,
    base_url: String,
) -> JoinHandle<()> {
    let interval = std::env::var("DIGEST_INTERVAL_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .map(Duration::from_secs)
        .unwrap_or(DEFAULT_INTERVAL);

    info!(
        interval_secs = interval.as_secs(),
        "Starting notification digest background task"
    );

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(interval);
        // Skip the immediate first tick so the server can finish starting up.
        ticker.tick().await;

        loop {
            ticker.tick().await;
            match run_daily_email_digest(&pool, mailer.as_ref(), &base_url, Utc::now()).await {
                Ok(stats) => {
                    info!(
                        users_processed = stats.users_processed,
                        emails_sent = stats.emails_sent,
                        errors = stats.errors,
                        "Notification digest cycle complete"
                    );
                }
                Err(e) => {
                    error!(error = %e, "Notification digest cycle failed");
                }
            }
        }
    })
}
