use db::{
    DBService,
    models::{
        project::Project,
        shared_task::{SharedActivityCursor, SharedTask},
    },
};
use remote::{
    activity::{ActivityEvent, ActivityResponse},
    db::{projects::ProjectMetadata, tasks::SharedTaskActivityPayload},
};
use reqwest::Client as HttpClient;
use uuid::Uuid;

use super::{ShareConfig, ShareError, convert_remote_task, sync_local_task_for_shared_task};
use crate::services::clerk::{ClerkSession, ClerkSessionStore};

/// Processor for handling activity events and synchronizing shared tasks.
#[derive(Clone)]
pub(super) struct ActivityProcessor {
    db: DBService,
    config: ShareConfig,
    client: HttpClient,
    sessions: ClerkSessionStore,
}

impl ActivityProcessor {
    pub fn new(db: DBService, config: ShareConfig, sessions: ClerkSessionStore) -> Self {
        Self {
            db,
            config,
            client: HttpClient::new(),
            sessions,
        }
    }

    pub async fn process_event(&self, event: ActivityEvent) -> Result<(), ShareError> {
        if let Some(payload) = &event.payload {
            match serde_json::from_value::<SharedTaskActivityPayload>(payload.clone()) {
                Ok(SharedTaskActivityPayload { task, project }) => {
                    if let Some(project_id) = self.resolve_project_id(task.id, &project).await? {
                        let input = convert_remote_task(&task, project_id, Some(event.seq));
                        let shared_task = SharedTask::upsert(&self.db.pool, input).await?;

                        let current_session = self.sessions.active().await;
                        let current_user_id = current_session.as_ref().map(|s| s.user_id.as_str());
                        sync_local_task_for_shared_task(
                            &self.db.pool,
                            &shared_task,
                            current_user_id,
                            task.creator_user_id.as_deref(),
                        )
                        .await?;
                    } else {
                        tracing::warn!(
                            task_id = %task.id,
                            repo_id = project.github_repository_id,
                            owner = %project.owner,
                            name = %project.name,
                            "skipping shared task; project not found locally"
                        );
                    }
                }
                Err(error) => {
                    tracing::warn!(
                        ?error,
                        event_id = %event.event_id,
                        "unrecognized shared task payload; skipping"
                    );
                }
            }
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
            if events.len() < (self.config.activity_page_limit as usize) {
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
        let mut url = self.config.activity_endpoint()?;

        {
            let mut qp = url.query_pairs_mut();
            qp.append_pair("limit", &self.config.activity_page_limit.to_string());
            if let Some(s) = after {
                qp.append_pair("after", &s.to_string());
            }
        }

        let resp = self
            .client
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

    async fn resolve_project_id(
        &self,
        task_id: Uuid,
        metadata: &ProjectMetadata,
    ) -> Result<Option<Uuid>, ShareError> {
        if let Some(existing) = SharedTask::find_by_id(&self.db.pool, task_id).await? {
            return Ok(Some(existing.project_id));
        }

        if let Some(project) =
            Project::find_by_github_repo_id(&self.db.pool, metadata.github_repository_id).await?
        {
            return Ok(Some(project.id));
        }

        Ok(None)
    }
}
