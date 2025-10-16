use db::{
    DBService,
    models::shared_task::{SharedActivityCursor, SharedTask},
};
use remote::{
    activity::{ActivityEvent, ActivityResponse},
    db::tasks::SharedTask as RemoteSharedTask,
};
use reqwest::{Client as HttpClient, Url};

use super::{RemoteSyncConfig, ShareError, convert_remote_task};
use crate::services::clerk::ClerkSession;

/// Processor for handling activity events and synchronizing shared tasks.
#[derive(Clone)]
pub(super) struct ActivityProcessor {
    db: DBService,
    remote_config: RemoteSyncConfig,
    http_client: HttpClient,
}

impl ActivityProcessor {
    pub fn new(db: DBService, config: RemoteSyncConfig) -> Self {
        Self {
            db,
            remote_config: config,
            http_client: HttpClient::new(),
        }
    }

    pub async fn process_event(&self, event: ActivityEvent) -> Result<(), ShareError> {
        if let Some(payload) = &event.payload {
            let remote_task: RemoteSharedTask = serde_json::from_value(payload.clone())?;
            let input = convert_remote_task(&remote_task, Some(event.seq));
            SharedTask::upsert(&self.db.pool, input).await?;
        } else {
            tracing::warn!(event_id = %event.event_id, "received activity event with empty payload");
        }

        SharedActivityCursor::upsert(&self.db.pool, event.organization_id, event.seq).await?;
        Ok(())
    }

    /// Fetch and process activity events until caught up.
    pub async fn catch_up(
        &self,
        session: &ClerkSession,
        mut last_seq: Option<i64>,
    ) -> Result<Option<i64>, ShareError> {
        loop {
            let events = self.fetch_activity(session, last_seq).await?;
            if events.is_empty() {
                break;
            }
            for ev in events.iter() {
                self.process_event(ev.clone()).await?;
                last_seq = Some(ev.seq);
            }
            if events.len() < (self.remote_config.activity_page_limit as usize) {
                break;
            }
        }
        Ok(last_seq)
    }

    /// Fetch a page of activity events from the remote service.
    async fn fetch_activity(
        &self,
        session: &ClerkSession,
        after: Option<i64>,
    ) -> Result<Vec<ActivityEvent>, ShareError> {
        let mut url = Url::parse(&self.remote_config.activity_endpoint())?;
        {
            let mut qp = url.query_pairs_mut();
            qp.append_pair("limit", &self.remote_config.activity_page_limit.to_string());
            if let Some(s) = after {
                qp.append_pair("after", &s.to_string());
            }
        }

        let resp = self
            .http_client
            .get(url)
            .bearer_auth(session.bearer())
            .send()
            .await
            .map_err(ShareError::Transport)?;

        if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(ShareError::MissingAuth);
        }

        let resp = resp.error_for_status().map_err(ShareError::Transport)?;
        let resp_body = resp.json::<ActivityResponse>().await?;
        Ok(resp_body.data)
    }
}
