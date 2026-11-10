use std::sync::Arc;

use db::models::webhook::Webhook;
use reqwest::Client;
use serde_json::Value;
use sqlx::SqlitePool;
use tokio_stream::wrappers::BroadcastStream;
use utils::{log_msg::LogMsg, msg_store::MsgStore};

use futures::StreamExt;

/// Subscribes to the events MsgStore and POSTs JSON-patch payloads to all
/// registered and enabled webhook URLs.
pub struct WebhookDispatcher {
    pool: SqlitePool,
    msg_store: Arc<MsgStore>,
    http: Client,
}

impl WebhookDispatcher {
    pub fn new(pool: SqlitePool, msg_store: Arc<MsgStore>) -> Self {
        Self {
            pool,
            msg_store,
            http: Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("reqwest client"),
        }
    }

    /// Spawn a background task that fans out events to all enabled webhooks.
    pub fn spawn(self) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            self.run().await;
        })
    }

    async fn run(self) {
        let rx = self.msg_store.get_receiver();
        let mut stream = BroadcastStream::new(rx);

        while let Some(item) = stream.next().await {
            let msg = match item {
                Ok(m) => m,
                Err(_) => continue, // lagged — skip
            };

            let payload: Option<Value> = match &msg {
                LogMsg::JsonPatch(patch) => serde_json::to_value(patch).ok(),
                _ => None,
            };

            let Some(payload) = payload else { continue };

            // Load enabled webhooks each delivery (low frequency, but always fresh)
            let hooks = match Webhook::find_enabled(&self.pool).await {
                Ok(h) => h,
                Err(e) => {
                    tracing::warn!("webhook_dispatcher: db error loading webhooks: {e}");
                    continue;
                }
            };

            if hooks.is_empty() {
                continue;
            }

            // Fan-out concurrently
            let futs: Vec<_> = hooks
                .into_iter()
                .map(|hook| {
                    let client = self.http.clone();
                    let body = payload.clone();
                    async move {
                        let mut req = client
                            .post(&hook.url)
                            .header("Content-Type", "application/json")
                            .header("X-VK-Event", "patch");

                        if let Some(secret) = &hook.secret {
                            req = req.header("X-VK-Secret", secret.as_str());
                        }

                        match req.json(&body).send().await {
                            Ok(resp) if resp.status().is_success() => {}
                            Ok(resp) => {
                                tracing::warn!(
                                    url = %hook.url,
                                    status = %resp.status(),
                                    "webhook delivery non-2xx"
                                );
                            }
                            Err(e) => {
                                tracing::warn!(url = %hook.url, "webhook delivery error: {e}");
                            }
                        }
                    }
                })
                .collect();

            futures::future::join_all(futs).await;
        }
    }
}
