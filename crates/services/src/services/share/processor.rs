use std::collections::HashSet;

use db::{
    DBService,
    models::{
        project::Project,
        shared_task::{SharedActivityCursor, SharedTask, SharedTaskInput},
        task::Task,
    },
};
use remote::{
    activity::{ActivityEvent, ActivityResponse},
    api::tasks::BulkSharedTasksResponse,
    db::{projects::ProjectMetadata, tasks::SharedTaskActivityPayload},
};
use reqwest::Client as HttpClient;
use uuid::Uuid;

use super::{
    GithubProjectLinkingCache, ShareConfig, ShareError, convert_remote_task,
    sync_local_task_for_shared_task,
};
use crate::services::clerk::{ClerkSession, ClerkSessionStore};

struct PreparedBulkTask {
    input: SharedTaskInput,
    creator_user_id: Option<String>,
}

/// Processor for handling activity events and synchronizing shared tasks.
#[derive(Clone)]
pub struct ActivityProcessor {
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
        match event.event_type.as_str() {
            "task.deleted" => self.process_deleted_task_event(&event).await?,
            _ => self.process_upsert_event(&event).await?,
        }

        SharedActivityCursor::upsert(&self.db.pool, event.organization_id, event.seq).await?;
        Ok(())
    }

    /// Fetch and process activity events until caught up, falling back to bulk syncs when needed.
    pub async fn catch_up(
        &self,
        session: &ClerkSession,
        mut last_seq: Option<i64>,
    ) -> Result<Option<i64>, ShareError> {
        if last_seq.is_none() {
            last_seq = self.bulk_sync(session).await?;
        }

        loop {
            let events = self.fetch_activity(session, last_seq).await?;
            if events.is_empty() {
                break;
            }

            // Perform a bulk sync if we've fallen too far behind
            if let Some(prev_seq) = last_seq
                && let Some(newest) = events.last()
                && newest.seq.saturating_sub(prev_seq) > self.config.bulk_sync_threshold as i64
            {
                last_seq = self.bulk_sync(session).await?;
                continue;
            }

            let page_len = events.len();
            for ev in events {
                self.process_event(ev.clone()).await?;
                last_seq = Some(ev.seq);
            }

            if page_len < (self.config.activity_page_limit as usize) {
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
        if let Some(existing) = SharedTask::find_by_id(&self.db.pool, task_id).await?
            && let Some(project_id) = existing.project_id
        {
            return Ok(Some(project_id));
        }

        if let Some(project) =
            Project::find_by_github_repo_id(&self.db.pool, metadata.github_repository_id).await?
        {
            return Ok(Some(project.id));
        }

        Ok(None)
    }

    async fn process_upsert_event(&self, event: &ActivityEvent) -> Result<(), ShareError> {
        let Some(payload) = &event.payload else {
            tracing::warn!(event_id = %event.event_id, "received activity event with empty payload");
            return Ok(());
        };

        match serde_json::from_value::<SharedTaskActivityPayload>(payload.clone()) {
            Ok(SharedTaskActivityPayload {
                task,
                project,
                user,
            }) => {
                let project_id = self.resolve_project_id(task.id, &project).await?;
                if project_id.is_none() {
                    GithubProjectLinkingCache::needs_linking(project.github_repository_id);
                }
                if project_id.is_none() {
                    tracing::debug!(
                        task_id = %task.id,
                        repo_id = project.github_repository_id,
                        owner = %project.owner,
                        name = %project.name,
                        "stored shared task without local project; awaiting metadata link"
                    );
                }

                let input = convert_remote_task(
                    &task,
                    user.as_ref(),
                    project_id,
                    Some(project.github_repository_id),
                    Some(event.seq),
                );
                let shared_task = SharedTask::upsert(&self.db.pool, input).await?;

                let current_session = self.sessions.last().await;
                let current_user_id = current_session.as_ref().map(|s| s.user_id.as_str());
                sync_local_task_for_shared_task(
                    &self.db.pool,
                    &shared_task,
                    current_user_id,
                    task.creator_user_id.as_deref(),
                )
                .await?;
            }
            Err(error) => {
                tracing::warn!(
                    ?error,
                    event_id = %event.event_id,
                    "unrecognized shared task payload; skipping"
                );
            }
        }

        Ok(())
    }

    async fn process_deleted_task_event(&self, event: &ActivityEvent) -> Result<(), ShareError> {
        let Some(payload) = &event.payload else {
            tracing::warn!(
                event_id = %event.event_id,
                "received delete event without payload; skipping"
            );
            return Ok(());
        };

        let SharedTaskActivityPayload { task, .. } =
            match serde_json::from_value::<SharedTaskActivityPayload>(payload.clone()) {
                Ok(payload) => payload,
                Err(error) => {
                    tracing::warn!(
                        ?error,
                        event_id = %event.event_id,
                        "failed to parse deleted task payload; skipping"
                    );
                    return Ok(());
                }
            };

        if let Some(local_task) = Task::find_by_shared_task_id(&self.db.pool, task.id).await? {
            Task::set_shared_task_id(&self.db.pool, local_task.id, None).await?;
        }

        SharedTask::remove(&self.db.pool, task.id).await?;
        Ok(())
    }

    async fn bulk_sync(&self, session: &ClerkSession) -> Result<Option<i64>, ShareError> {
        let org_id = session.org_id.clone().ok_or(ShareError::MissingAuth)?;

        let snapshot = self.fetch_bulk_snapshot(session).await?;
        let latest_seq = snapshot.latest_seq;

        let mut keep_ids = HashSet::new();
        let mut replacements = Vec::new();

        for payload in snapshot.tasks {
            let project_id = self
                .resolve_project_id(payload.task.id, &payload.project)
                .await?;

            if project_id.is_none() {
                GithubProjectLinkingCache::needs_linking(payload.project.github_repository_id);
                tracing::debug!(
                    task_id = %payload.task.id,
                    repo_id = payload.project.github_repository_id,
                    owner = %payload.project.owner,
                    name = %payload.project.name,
                    "storing shared task during bulk sync without local project"
                );
            }

            keep_ids.insert(payload.task.id);
            let input = convert_remote_task(
                &payload.task,
                payload.user.as_ref(),
                project_id,
                Some(payload.project.github_repository_id),
                latest_seq,
            );
            replacements.push(PreparedBulkTask {
                input,
                creator_user_id: payload.task.creator_user_id.clone(),
            });
        }

        let mut stale: HashSet<Uuid> = SharedTask::list_by_organization(&self.db.pool, &org_id)
            .await?
            .into_iter()
            .filter_map(|task| {
                if keep_ids.contains(&task.id) {
                    None
                } else {
                    Some(task.id)
                }
            })
            .collect();

        for deleted in snapshot.deleted_task_ids {
            if !keep_ids.contains(&deleted) {
                stale.insert(deleted);
            }
        }

        let stale_vec: Vec<Uuid> = stale.into_iter().collect();
        self.remove_stale_tasks(&stale_vec).await?;

        let current_session = self.sessions.last().await;
        let current_user_id = current_session.as_ref().map(|s| s.user_id.as_str());

        for PreparedBulkTask {
            input,
            creator_user_id,
        } in replacements
        {
            let shared_task = SharedTask::upsert(&self.db.pool, input).await?;
            sync_local_task_for_shared_task(
                &self.db.pool,
                &shared_task,
                current_user_id,
                creator_user_id.as_deref(),
            )
            .await?;
        }

        if let Some(seq) = latest_seq {
            SharedActivityCursor::upsert(&self.db.pool, org_id, seq).await?;
        }

        Ok(latest_seq)
    }

    async fn remove_stale_tasks(&self, ids: &[Uuid]) -> Result<(), ShareError> {
        if ids.is_empty() {
            return Ok(());
        }

        for id in ids {
            if let Some(local_task) = Task::find_by_shared_task_id(&self.db.pool, *id).await? {
                Task::set_shared_task_id(&self.db.pool, local_task.id, None).await?;
            }
        }

        SharedTask::remove_many(&self.db.pool, ids).await?;
        Ok(())
    }

    async fn fetch_bulk_snapshot(
        &self,
        session: &ClerkSession,
    ) -> Result<BulkSharedTasksResponse, ShareError> {
        let url = self.config.bulk_tasks_endpoint()?;

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
        let body = resp.json::<BulkSharedTasksResponse>().await?;
        Ok(body)
    }
}
