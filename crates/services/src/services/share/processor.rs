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
    db::{projects::ProjectMetadata, tasks::SharedTaskActivityPayload},
    routes::tasks::BulkSharedTasksResponse,
};
use reqwest::Client as HttpClient;
use uuid::Uuid;

use super::{ShareConfig, ShareError, convert_remote_task, sync_local_task_for_shared_task};
use crate::services::auth::AuthContext;

struct PreparedBulkTask {
    input: SharedTaskInput,
    creator_user_id: Option<uuid::Uuid>,
}

/// Processor for handling activity events and synchronizing shared tasks.
#[derive(Clone)]
pub struct ActivityProcessor {
    db: DBService,
    config: ShareConfig,
    client: HttpClient,
    auth_ctx: AuthContext,
}

impl ActivityProcessor {
    pub fn new(db: DBService, config: ShareConfig, auth_ctx: AuthContext) -> Self {
        Self {
            db,
            config,
            client: HttpClient::new(),
            auth_ctx,
        }
    }

    pub fn database(&self) -> DBService {
        self.db.clone()
    }

    pub async fn process_event(&self, event: ActivityEvent) -> Result<(), ShareError> {
        match event.event_type.as_str() {
            "task.deleted" => self.process_deleted_task_event(&event).await?,
            _ => self.process_upsert_event(&event).await?,
        }

        SharedActivityCursor::upsert(&self.db.pool, event.project_id, event.seq).await?;
        Ok(())
    }

    /// Fetch and process activity events until caught up, falling back to bulk syncs when needed.
    pub async fn catch_up_project(
        &self,
        remote_project_id: Uuid,
        mut last_seq: Option<i64>,
    ) -> Result<Option<i64>, ShareError> {
        if last_seq.is_none() {
            last_seq = self.bulk_sync(remote_project_id).await?;
        }

        loop {
            let events = self.fetch_activity(remote_project_id, last_seq).await?;
            if events.is_empty() {
                break;
            }

            // Perform a bulk sync if we've fallen too far behind
            if let Some(prev_seq) = last_seq
                && let Some(newest) = events.last()
                && newest.seq.saturating_sub(prev_seq) > self.config.bulk_sync_threshold as i64
            {
                last_seq = self.bulk_sync(remote_project_id).await?;
                continue;
            }

            let page_len = events.len();
            for ev in events {
                if ev.project_id != remote_project_id {
                    tracing::warn!(
                        expected = %remote_project_id,
                        received = %ev.project_id,
                        "received activity for unexpected project; ignoring"
                    );
                    continue;
                }
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
        remote_project_id: Uuid,
        after: Option<i64>,
    ) -> Result<Vec<ActivityEvent>, ShareError> {
        let access_token = self
            .auth_ctx
            .get_credentials()
            .await
            .ok_or(ShareError::MissingAuth)?
            .access_token;

        let mut url = self.config.activity_endpoint()?;

        {
            let mut qp = url.query_pairs_mut();
            qp.append_pair("limit", &self.config.activity_page_limit.to_string());
            qp.append_pair("project_id", &remote_project_id.to_string());
            if let Some(s) = after {
                qp.append_pair("after", &s.to_string());
            }
        }

        let resp = self
            .client
            .get(url)
            .bearer_auth(&access_token)
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
        remote_project_id: Uuid,
        metadata: &ProjectMetadata,
    ) -> Result<Option<Uuid>, ShareError> {
        if let Some(existing) = SharedTask::find_by_id(&self.db.pool, task_id).await?
            && let Some(project_id) = existing.project_id
        {
            return Ok(Some(project_id));
        }

        if let Some(project) =
            Project::find_by_remote_project_id(&self.db.pool, remote_project_id).await?
        {
            return Ok(Some(project.id));
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
                let project_id = self
                    .resolve_project_id(task.id, event.project_id, &project)
                    .await?;
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

                let current_profile = self.auth_ctx.cached_profile().await;
                let current_user_id = current_profile.as_ref().map(|p| p.user_id);
                sync_local_task_for_shared_task(
                    &self.db.pool,
                    &shared_task,
                    current_user_id,
                    task.creator_user_id,
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

    async fn bulk_sync(&self, remote_project_id: Uuid) -> Result<Option<i64>, ShareError> {
        let bulk_resp = self.fetch_bulk_snapshot(remote_project_id).await?;
        let latest_seq = bulk_resp.latest_seq;

        let mut keep_ids = HashSet::new();
        let mut replacements = Vec::new();

        for payload in bulk_resp.tasks {
            let project_id = self
                .resolve_project_id(payload.task.id, remote_project_id, &payload.project)
                .await?;

            if project_id.is_none() {
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
                creator_user_id: payload.task.creator_user_id,
            });
        }

        let mut stale: HashSet<Uuid> =
            SharedTask::list_by_remote_project_id(&self.db.pool, remote_project_id)
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

        for deleted in bulk_resp.deleted_task_ids {
            if !keep_ids.contains(&deleted) {
                stale.insert(deleted);
            }
        }

        let stale_vec: Vec<Uuid> = stale.into_iter().collect();
        self.remove_stale_tasks(&stale_vec).await?;

        let current_profile = self.auth_ctx.cached_profile().await;
        let current_user_id = current_profile.as_ref().map(|p| p.user_id);

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
                creator_user_id,
            )
            .await?;
        }

        if let Some(seq) = latest_seq {
            SharedActivityCursor::upsert(&self.db.pool, remote_project_id, seq).await?;
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
        remote_project_id: Uuid,
    ) -> Result<BulkSharedTasksResponse, ShareError> {
        let access_token = self
            .auth_ctx
            .get_credentials()
            .await
            .ok_or(ShareError::MissingAuth)?
            .access_token;

        let mut url = self.config.bulk_tasks_endpoint()?;
        {
            let mut qp = url.query_pairs_mut();
            qp.append_pair("project_id", &remote_project_id.to_string());
        }

        let resp = self
            .client
            .get(url)
            .bearer_auth(&access_token)
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
