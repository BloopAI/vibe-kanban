//! Activity event processor for syncing labels and task metadata from the Hive.
//!
//! This processor handles:
//! - Label events (create, update, delete) - fully synced to local database
//! - Task events (create, update) - syncs version and metadata to keep local state fresh

use db::{
    DBService,
    models::{label::Label, project::Project, shared_activity_cursor::SharedActivityCursor, task::Task},
};
use remote::{
    activity::ActivityEvent,
    db::{labels::LabelActivityPayload, tasks::SharedTaskActivityPayload},
};
use sqlx::{Sqlite, Transaction};
use tracing::{debug, info, warn};
use uuid::Uuid;

use super::{ShareConfig, ShareError};
use crate::services::{auth::AuthContext, remote_client::RemoteClient};

/// Processor for handling activity events from the Hive.
///
/// This processor handles:
/// - Label events (create, update, delete) - synced to local database
/// - Task events (create, update) - syncs version/metadata to keep local cache fresh
#[derive(Clone)]
pub struct ActivityProcessor {
    db: DBService,
    config: ShareConfig,
    remote_client: RemoteClient,
    #[allow(dead_code)]
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

    pub fn remote_client(&self) -> RemoteClient {
        self.remote_client.clone()
    }

    pub async fn process_event(&self, event: ActivityEvent) -> Result<(), ShareError> {
        let mut tx = self.db.pool.begin().await?;

        match event.event_type.as_str() {
            // Label events - sync to local database
            "label.created" | "label.updated" => {
                self.process_label_upsert_event(&mut tx, &event).await?
            }
            "label.deleted" => self.process_label_deleted_event(&mut tx, &event).await?,

            // Task events - sync version and metadata to keep local cache fresh
            "task.created" | "task.updated" => {
                self.process_task_upsert_event(&mut tx, &event).await?
            }
            "task.deleted" => {
                // Task deletion is handled by clearing shared_task_id (soft unlink)
                self.process_task_deleted_event(&mut tx, &event).await?
            }

            // Unknown events
            _ => {
                debug!(
                    event_type = %event.event_type,
                    event_id = %event.event_id,
                    "Ignoring unknown event type"
                );
            }
        }

        // Always update cursor position
        SharedActivityCursor::upsert(tx.as_mut(), event.project_id, event.seq).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Fetch and process activity events until caught up.
    pub async fn catch_up_project(
        &self,
        remote_project_id: Uuid,
        mut last_seq: Option<i64>,
    ) -> Result<Option<i64>, ShareError> {
        loop {
            let events = self.fetch_activity(remote_project_id, last_seq).await?;
            if events.is_empty() {
                break;
            }

            let page_len = events.len();
            for ev in events {
                if ev.project_id != remote_project_id {
                    warn!(
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

    // =========================================================================
    // Label event processing
    // =========================================================================

    /// Process a label.created or label.updated event from the Hive.
    /// This syncs the label from the Hive to the local database.
    async fn process_label_upsert_event(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        event: &ActivityEvent,
    ) -> Result<(), ShareError> {
        let Some(payload) = &event.payload else {
            warn!(
                event_id = %event.event_id,
                "received label upsert event with empty payload"
            );
            return Ok(());
        };

        let label_payload = match serde_json::from_value::<LabelActivityPayload>(payload.clone()) {
            Ok(p) => p,
            Err(error) => {
                warn!(
                    ?error,
                    event_id = %event.event_id,
                    "failed to parse label activity payload; skipping"
                );
                return Ok(());
            }
        };

        let hive_label = label_payload.label;

        // Check if we already have this label locally (by shared_label_id)
        if let Some(existing) = Label::find_by_shared_label_id(tx.as_mut(), hive_label.id).await? {
            // Update existing label if the Hive version is newer
            if hive_label.version > existing.version {
                Label::update_from_hive(
                    tx.as_mut(),
                    existing.id,
                    &hive_label.name,
                    &hive_label.icon,
                    &hive_label.color,
                    hive_label.version,
                )
                .await?;
                debug!(
                    local_label_id = %existing.id,
                    shared_label_id = %hive_label.id,
                    "Updated local label from Hive"
                );
            } else {
                debug!(
                    local_label_id = %existing.id,
                    shared_label_id = %hive_label.id,
                    local_version = existing.version,
                    hive_version = hive_label.version,
                    "Skipping label update - local version is newer or equal"
                );
            }
        } else {
            // Create new local label from Hive
            // Map project_id from remote to local if this is a project-scoped label
            let local_project_id = if let Some(remote_project_id) = hive_label.project_id {
                Project::find_by_remote_project_id(tx.as_mut(), remote_project_id)
                    .await?
                    .map(|p| p.id)
            } else {
                None
            };

            Label::create_from_hive(
                tx.as_mut(),
                hive_label.id,
                local_project_id,
                &hive_label.name,
                &hive_label.icon,
                &hive_label.color,
                hive_label.version,
            )
            .await?;
            debug!(
                shared_label_id = %hive_label.id,
                label_name = %hive_label.name,
                "Created local label from Hive"
            );
        }

        Ok(())
    }

    /// Process a label.deleted event from the Hive.
    /// This removes the shared_label_id from the local label (soft unlink).
    async fn process_label_deleted_event(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        event: &ActivityEvent,
    ) -> Result<(), ShareError> {
        let Some(payload) = &event.payload else {
            warn!(
                event_id = %event.event_id,
                "received label delete event with empty payload"
            );
            return Ok(());
        };

        let label_payload = match serde_json::from_value::<LabelActivityPayload>(payload.clone()) {
            Ok(p) => p,
            Err(error) => {
                warn!(
                    ?error,
                    event_id = %event.event_id,
                    "failed to parse label delete payload; skipping"
                );
                return Ok(());
            }
        };

        let hive_label = label_payload.label;

        // Find local label by shared_label_id and unlink it
        if let Some(existing) = Label::find_by_shared_label_id(tx.as_mut(), hive_label.id).await? {
            // Clear the shared_label_id to unlink from Hive
            // We don't delete the local label - just unlink it
            Label::clear_shared_label_id(tx.as_mut(), existing.id).await?;

            debug!(
                local_label_id = %existing.id,
                shared_label_id = %hive_label.id,
                "Unlinked local label from deleted Hive label"
            );
        }

        Ok(())
    }

    // =========================================================================
    // Task event processing
    // =========================================================================

    /// Syncs a Hive task create/update event into the local database.
    ///
    /// Parses the event payload and upserts the corresponding local task record (creating or updating)
    /// to reflect Hive's title, description, status, assignee, archived state, and remote version.
    /// If the payload is missing or cannot be parsed, or if the Hive task has no `project_id` or
    /// there is no matching local project, the function logs the condition and returns success without
    /// performing any upsert.
    ///
    /// # Examples
    ///
    /// ```rust,no_run
    /// // Illustrative example; types and setup are omitted for brevity.
    /// # async fn doc_example(processor: &ActivityProcessor, tx: &mut Transaction<'_, Sqlite>, event: ActivityEvent) -> Result<(), ShareError> {
    /// processor.process_task_upsert_event(tx, &event).await?;
    /// # Ok(())
    /// # }
    /// ```
    async fn process_task_upsert_event(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        event: &ActivityEvent,
    ) -> Result<(), ShareError> {
        let Some(payload) = &event.payload else {
            warn!(
                event_id = %event.event_id,
                "received task upsert event with empty payload"
            );
            return Ok(());
        };

        let task_payload =
            match serde_json::from_value::<SharedTaskActivityPayload>(payload.clone()) {
                Ok(p) => p,
                Err(error) => {
                    warn!(
                        ?error,
                        event_id = %event.event_id,
                        "failed to parse task activity payload; skipping"
                    );
                    return Ok(());
                }
            };

        let hive_task = task_payload.task;
        let hive_user = task_payload.user;

        // Get the project_id (skip if not set - task has no legacy project link)
        let remote_project_id = match hive_task.project_id {
            Some(id) => id,
            None => {
                debug!(
                    shared_task_id = %hive_task.id,
                    "Skipping task sync - task has no project_id"
                );
                return Ok(());
            }
        };

        // Find the local project for this remote project
        let local_project =
            match Project::find_by_remote_project_id(tx.as_mut(), remote_project_id).await? {
                Some(p) => p,
                None => {
                    debug!(
                        remote_project_id = %remote_project_id,
                        shared_task_id = %hive_task.id,
                        "Skipping task sync - no local project for remote project"
                    );
                    return Ok(());
                }
            };

        // Map Hive status to local TaskStatus
        let status = match hive_task.status {
            remote::db::tasks::TaskStatus::Todo => db::models::task::TaskStatus::Todo,
            remote::db::tasks::TaskStatus::InProgress => db::models::task::TaskStatus::InProgress,
            remote::db::tasks::TaskStatus::InReview => db::models::task::TaskStatus::InReview,
            remote::db::tasks::TaskStatus::Done => db::models::task::TaskStatus::Done,
            remote::db::tasks::TaskStatus::Cancelled => db::models::task::TaskStatus::Cancelled,
        };

        // Extract user info
        let (assignee_user_id, assignee_name, assignee_username) = match hive_user {
            Some(user) => {
                let name = match (&user.first_name, &user.last_name) {
                    (Some(first), Some(last)) => Some(format!("{} {}", first, last)),
                    (Some(first), None) => Some(first.clone()),
                    (None, Some(last)) => Some(last.clone()),
                    (None, None) => None,
                };
                (Some(user.id), name, user.username)
            }
            None => (None, None, None),
        };

        // Upsert the task - this updates remote_version and other metadata
        // Note: Uses pool directly (not transaction) to support stale version fallback
        Task::upsert_remote_task(
            &self.db.pool,
            Uuid::new_v4(), // local_id - only used for new tasks
            local_project.id,
            hive_task.id, // shared_task_id
            hive_task.title.clone(),
            hive_task.description.clone(),
            status,
            assignee_user_id,
            assignee_name,
            assignee_username,
            hive_task.version,
            None, // activity_at
            hive_task.archived_at,
        )
        .await?;

        info!(
            shared_task_id = %hive_task.id,
            version = hive_task.version,
            title = %hive_task.title,
            "Synced task from Hive"
        );

        Ok(())
    }

    /// Process a task.deleted event from the Hive.
    /// This clears the shared_task_id from the local task (soft unlink).
    async fn process_task_deleted_event(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        event: &ActivityEvent,
    ) -> Result<(), ShareError> {
        let Some(payload) = &event.payload else {
            warn!(
                event_id = %event.event_id,
                "received task delete event with empty payload"
            );
            return Ok(());
        };

        let task_payload =
            match serde_json::from_value::<SharedTaskActivityPayload>(payload.clone()) {
                Ok(p) => p,
                Err(error) => {
                    warn!(
                        ?error,
                        event_id = %event.event_id,
                        "failed to parse task delete payload; skipping"
                    );
                    return Ok(());
                }
            };

        let hive_task = task_payload.task;

        // Find local task by shared_task_id and unlink it
        if let Some(existing) = Task::find_by_shared_task_id(tx.as_mut(), hive_task.id).await? {
            // Clear the shared_task_id to unlink from Hive
            // We don't delete the local task - just unlink it
            Task::set_shared_task_id(tx.as_mut(), existing.id, None).await?;

            debug!(
                local_task_id = %existing.id,
                shared_task_id = %hive_task.id,
                "Unlinked local task from deleted Hive task"
            );
        }

        Ok(())
    }
}