use std::time::Duration;

use anyhow::Context;
use serde::Deserialize;
use sqlx::{PgPool, postgres::PgListener};
use tokio::time::sleep;
use tracing::instrument;
use uuid::Uuid;

use crate::{activity::ActivityBroker, db::activity::ActivityRepository};

pub struct ActivityListener {
    pool: PgPool,
    broker: ActivityBroker,
    channel: String,
}

impl ActivityListener {
    pub fn new(pool: PgPool, broker: ActivityBroker, channel: String) -> Self {
        Self {
            pool,
            broker,
            channel,
        }
    }

    #[instrument(
        name = "activity.listener",
        skip(self),
        fields(channel = %self.channel)
    )]
    pub async fn run(self) {
        let mut backoff = Duration::from_secs(1);
        let max_backoff = Duration::from_secs(30);

        let pool = self.pool;
        let broker = self.broker;
        let channel = self.channel;

        loop {
            match listen_loop(&pool, &broker, &channel).await {
                Ok(_) => {
                    backoff = Duration::from_secs(1);
                }
                Err(error) => {
                    tracing::error!(?error, ?backoff, "activity listener error; retrying");
                    sleep(backoff).await;
                    backoff = (backoff * 2).min(max_backoff);
                }
            }
        }
    }
}

#[instrument(
    name = "activity.listen_loop",
    skip(pool, broker),
    fields(channel = %channel)
)]
async fn listen_loop(pool: &PgPool, broker: &ActivityBroker, channel: &str) -> anyhow::Result<()> {
    let mut listener = PgListener::connect_with(pool)
        .await
        .context("failed to create LISTEN connection")?;
    listener
        .listen(channel)
        .await
        .with_context(|| format!("failed to LISTEN on channel {channel}"))?;

    loop {
        let notification = listener
            .recv()
            .await
            .context("failed to receive LISTEN notification")?;

        let payload: NotificationEnvelope = serde_json::from_str(notification.payload())
            .with_context(|| format!("invalid notification payload: {}", notification.payload()))?;

        tracing::trace!(%payload.seq, project_id = %payload.project_id, "received activity notification");

        let project_uuid = payload
            .project_id
            .parse::<Uuid>()
            .with_context(|| format!("invalid project_id UUID: {}", payload.project_id))?;

        let event = match ActivityRepository::new(pool)
            .fetch_by_seq(project_uuid, payload.seq)
            .await
        {
            Ok(Some(event)) => event,
            Ok(None) => {
                tracing::warn!(seq = payload.seq, project_id = %payload.project_id, "activity row missing for notification");
                continue;
            }
            Err(error) => {
                tracing::error!(?error, seq = payload.seq, project_id = %payload.project_id, "failed to fetch activity payload");
                continue;
            }
        };

        broker.publish(event);
    }
}

#[derive(Debug, Deserialize)]
struct NotificationEnvelope {
    seq: i64,
    project_id: String,
}
