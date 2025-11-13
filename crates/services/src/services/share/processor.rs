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
    activity::ActivityEvent, db::tasks::SharedTaskActivityPayload,
    routes::tasks::BulkSharedTasksResponse,
};
use sqlx::{Sqlite, Transaction};
use uuid::Uuid;

use super::{ShareConfig, ShareError, convert_remote_task, sync_local_task_for_shared_task};
use crate::services::{auth::AuthContext, remote_client::RemoteClient};

struct PreparedBulkTask {
    input: SharedTaskInput,
    creator_user_id: Option<uuid::Uuid>,
    project_id: Option<Uuid>,
}

/// Processor for handling activity events and synchronizing shared tasks.
#[derive(Clone)]
pub struct ActivityProcessor {
    db: DBService,
    config: ShareConfig,
    remote_client: RemoteClient,
    auth_ctx: AuthContext,
}

impl ActivityProcessor {
    pub fn new(
        db: DBService,
        config: ShareConfig,
        remote_client: RemoteClient,
        auth_ctx: AuthContext,
    ) -> Self {
        Self {
            db,
            config,
            remote_client,
            auth_ctx,
        }
    }

    pub async fn process_event(&self, event: ActivityEvent) -> Result<(), ShareError> {
        let mut tx = self.db.pool.begin().await?;
        match event.event_type.as_str() {
            "task.deleted" => self.process_deleted_task_event(&mut tx, &event).await?,
            _ => self.process_upsert_event(&mut tx, &event).await?,
        }

        SharedActivityCursor::upsert(tx.as_mut(), event.project_id, event.seq).await?;
        tx.commit().await?;
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
        let resp = self
            .remote_client
            .fetch_activity(remote_project_id, after, self.config.activity_page_limit)
            .await?;
        Ok(resp.data)
    }

    async fn resolve_project(
        &self,
        task_id: Uuid,
        remote_project_id: Uuid,
    ) -> Result<Option<Project>, ShareError> {
        if let Some(existing) = SharedTask::find_by_id(&self.db.pool, task_id).await?
            && let Some(project) =
                Project::find_by_remote_project_id(&self.db.pool, existing.remote_project_id)
                    .await?
        {
            return Ok(Some(project));
        }

        if let Some(project) =
            Project::find_by_remote_project_id(&self.db.pool, remote_project_id).await?
        {
            return Ok(Some(project));
        }

        Ok(None)
    }

    async fn process_upsert_event(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        event: &ActivityEvent,
    ) -> Result<(), ShareError> {
        let Some(payload) = &event.payload else {
            tracing::warn!(event_id = %event.event_id, "received activity event with empty payload");
            return Ok(());
        };

        match serde_json::from_value::<SharedTaskActivityPayload>(payload.clone()) {
            Ok(SharedTaskActivityPayload { task, user }) => {
                let project = self.resolve_project(task.id, event.project_id).await?;
                if project.is_none() {
                    tracing::debug!(
                        task_id = %task.id,
                        remote_project_id = %task.project_id,
                        "stored shared task without local project; awaiting link"
                    );
                }

                let project_id = project.as_ref().map(|p| p.id);
                let input = convert_remote_task(&task, user.as_ref(), Some(event.seq));
                let shared_task = SharedTask::upsert(tx.as_mut(), input).await?;

                let current_profile = self.auth_ctx.cached_profile().await;
                let current_user_id = current_profile.as_ref().map(|p| p.user_id);
                sync_local_task_for_shared_task(
                    tx.as_mut(),
                    &shared_task,
                    current_user_id,
                    task.creator_user_id,
                    project_id,
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

    async fn process_deleted_task_event(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        event: &ActivityEvent,
    ) -> Result<(), ShareError> {
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

        if let Some(local_task) = Task::find_by_shared_task_id(tx.as_mut(), task.id).await? {
            Task::set_shared_task_id(tx.as_mut(), local_task.id, None).await?;
        }

        SharedTask::remove(tx.as_mut(), task.id).await?;
        Ok(())
    }

    async fn bulk_sync(&self, remote_project_id: Uuid) -> Result<Option<i64>, ShareError> {
        let bulk_resp = self.fetch_bulk_snapshot(remote_project_id).await?;
        let latest_seq = bulk_resp.latest_seq;

        let mut keep_ids = HashSet::new();
        let mut replacements = Vec::new();

        for payload in bulk_resp.tasks {
            let project = self
                .resolve_project(payload.task.id, remote_project_id)
                .await?;

            if project.is_none() {
                tracing::debug!(
                    task_id = %payload.task.id,
                    remote_project_id = %payload.task.project_id,
                    "storing shared task during bulk sync without local project"
                );
            }

            let project_id = project.as_ref().map(|p| p.id);
            keep_ids.insert(payload.task.id);
            let input = convert_remote_task(&payload.task, payload.user.as_ref(), latest_seq);
            replacements.push(PreparedBulkTask {
                input,
                creator_user_id: payload.task.creator_user_id,
                project_id,
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
        let current_profile = self.auth_ctx.cached_profile().await;
        let current_user_id = current_profile.as_ref().map(|p| p.user_id);

        let mut tx = self.db.pool.begin().await?;
        self.remove_stale_tasks(&mut tx, &stale_vec).await?;

        for PreparedBulkTask {
            input,
            creator_user_id,
            project_id,
        } in replacements
        {
            let shared_task = SharedTask::upsert(tx.as_mut(), input).await?;
            sync_local_task_for_shared_task(
                tx.as_mut(),
                &shared_task,
                current_user_id,
                creator_user_id,
                project_id,
            )
            .await?;
        }

        if let Some(seq) = latest_seq {
            SharedActivityCursor::upsert(tx.as_mut(), remote_project_id, seq).await?;
        }

        tx.commit().await?;
        Ok(latest_seq)
    }

    async fn remove_stale_tasks(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        ids: &[Uuid],
    ) -> Result<(), ShareError> {
        if ids.is_empty() {
            return Ok(());
        }

        for id in ids {
            if let Some(local_task) = Task::find_by_shared_task_id(tx.as_mut(), *id).await? {
                Task::set_shared_task_id(tx.as_mut(), local_task.id, None).await?;
            }
        }

        SharedTask::remove_many(tx.as_mut(), ids).await?;
        Ok(())
    }

    async fn fetch_bulk_snapshot(
        &self,
        remote_project_id: Uuid,
    ) -> Result<BulkSharedTasksResponse, ShareError> {
        Ok(self
            .remote_client
            .fetch_bulk_snapshot(remote_project_id)
            .await?)
    }
}
