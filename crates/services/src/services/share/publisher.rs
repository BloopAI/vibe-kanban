//! Publisher for sharing local tasks to the Hive.
//!
//! This module handles pushing local tasks to the Hive server. When a task is shared,
//! the local `tasks.shared_task_id` is set to link it to the Hive task.
//!
//! # Note
//!
//! The local `shared_tasks` table is no longer used. ElectricSQL handles syncing
//! tasks from the Hive back to the local database.

use db::{
    DBService,
    models::{project::Project, task::Task, task_attempt::TaskAttempt},
};
use remote::routes::tasks::{
    CreateSharedTaskRequest, DeleteSharedTaskRequest, UpdateSharedTaskRequest,
};
use tracing::info;
use uuid::Uuid;

use super::{ShareError, status};
use crate::services::remote_client::{CreateRemoteProjectPayload, RemoteClient};

#[derive(Clone)]
pub struct SharePublisher {
    db: DBService,
    client: RemoteClient,
}

impl SharePublisher {
    pub fn new(db: DBService, client: RemoteClient) -> Self {
        Self { db, client }
    }

    /// Shares a local task to the Hive and links the local task to the created remote task.
    ///
    /// The `assignee_user_id` is optional; if provided, the remote task will be assigned to that user.
    ///
    /// # Returns
    ///
    /// The `Uuid` of the created remote shared task.
    ///
    /// # Errors
    ///
    /// Returns a `ShareError` if the task or project cannot be found, the task is already shared, or the remote operation fails.
    ///
    /// # Examples
    ///
    /// ```
    /// # use uuid::Uuid;
    /// # use futures::executor::block_on;
    /// # async fn example(publisher: &crate::SharePublisher, task_id: Uuid) {
    /// let remote_id = publisher.share_task(task_id, None).await.unwrap();
    /// assert!(remote_id != Uuid::nil());
    /// # }
    /// ```
    pub async fn share_task(
        &self,
        task_id: Uuid,
        assignee_user_id: Option<Uuid>,
    ) -> Result<Uuid, ShareError> {
        let task = Task::find_by_id(&self.db.pool, task_id)
            .await?
            .ok_or(ShareError::TaskNotFound(task_id))?;

        if task.shared_task_id.is_some() {
            return Err(ShareError::AlreadyShared(task.id));
        }

        let project = Project::find_by_id(&self.db.pool, task.project_id)
            .await?
            .ok_or(ShareError::ProjectNotFound(task.project_id))?;

        // Auto-link the project if it's not already linked
        let remote_project_id = match project.remote_project_id {
            Some(id) => id,
            None => self.ensure_project_linked(&project).await?,
        };

        // Get task labels and their shared_label_ids for sync
        let label_ids = {
            use db::models::label::Label;

            let labels = Label::find_by_task_id(&self.db.pool, task.id).await?;
            let shared_ids: Vec<_> = labels
                .into_iter()
                .filter_map(|l| l.shared_label_id)
                .collect();

            if shared_ids.is_empty() {
                None
            } else {
                Some(shared_ids)
            }
        };

        let payload = CreateSharedTaskRequest {
            swarm_project_id: remote_project_id,
            title: task.title.clone(),
            description: task.description.clone(),
            status: Some(status::to_remote(&task.status)),
            assignee_user_id,
            start_attempt: false, // Never auto-dispatch when sharing from local node
            source_task_id: None, // Not a re-sync operation
            source_node_id: None,
            label_ids,
        };

        let remote_task = self.client.create_shared_task(&payload).await?;

        // Link the local task to the Hive task
        Task::set_shared_task_id(&self.db.pool, task.id, Some(remote_task.task.id)).await?;

        // Reset attempt sync status so attempts get re-synced with the correct shared_task_id
        if let Err(e) = TaskAttempt::clear_hive_sync_for_task(&self.db.pool, task.id).await {
            tracing::warn!(
                error = ?e,
                task_id = %task.id,
                "failed to reset attempt sync status after creating shared task"
            );
        }

        Ok(remote_task.task.id)
    }

    pub async fn update_shared_task(&self, task: &Task) -> Result<(), ShareError> {
        // early exit if task has not been shared
        let Some(shared_task_id) = task.shared_task_id else {
            return Ok(());
        };

        // Get task labels and their shared_label_ids for sync
        // Always send Some(...) on update - Some(vec![]) clears labels, None means no change
        let label_ids = {
            use db::models::label::Label;

            let labels = Label::find_by_task_id(&self.db.pool, task.id).await?;
            let shared_ids: Vec<_> = labels
                .into_iter()
                .filter_map(|l| l.shared_label_id)
                .collect();

            Some(shared_ids)
        };

        let payload = UpdateSharedTaskRequest {
            title: Some(task.title.clone()),
            description: task.description.clone(),
            status: Some(status::to_remote(&task.status)),
            // Always sync archived_at - use Some(None) to unarchive, Some(Some(ts)) to archive
            archived_at: Some(task.archived_at),
            version: None,
            label_ids,
        };

        self.client
            .update_shared_task(shared_task_id, &payload)
            .await?;

        Ok(())
    }

    pub async fn update_shared_task_by_id(&self, task_id: Uuid) -> Result<(), ShareError> {
        let task = Task::find_by_id(&self.db.pool, task_id)
            .await?
            .ok_or(ShareError::TaskNotFound(task_id))?;

        self.update_shared_task(&task).await
    }

    pub async fn delete_shared_task(&self, shared_task_id: Uuid) -> Result<(), ShareError> {
        // Find the local task that references this shared task
        let local_task = Task::find_by_shared_task_id(&self.db.pool, shared_task_id).await?;

        // Get the version from the task's remote_version field if available
        let payload = DeleteSharedTaskRequest { version: None };

        self.client
            .delete_shared_task(shared_task_id, &payload)
            .await?;

        // Unlink the local task
        if let Some(local_task) = local_task {
            Task::set_shared_task_id(&self.db.pool, local_task.id, None).await?;
        }

        Ok(())
    }

    /// Auto-creates a remote project in the Hive and links it to the local project.
    /// Uses the first available organization (preferring personal org).
    /// Public version for use in startup migration.
    pub async fn ensure_project_linked_public(
        &self,
        project: &Project,
    ) -> Result<Uuid, ShareError> {
        self.ensure_project_linked(project).await
    }

    /// Auto-creates a remote project in the Hive and links it to the local project.
    /// Uses the first available organization (preferring personal org).
    async fn ensure_project_linked(&self, project: &Project) -> Result<Uuid, ShareError> {
        // Get organizations - use the first one (personal org is typically first)
        let orgs = self.client.list_organizations().await?;
        let org = orgs
            .organizations
            .first()
            .ok_or(ShareError::NoOrganizations)?;

        info!(
            project_id = %project.id,
            project_name = %project.name,
            organization_id = %org.id,
            "Auto-creating remote project for Hive sync"
        );

        // Create the remote project
        let remote_project = self
            .client
            .create_project(&CreateRemoteProjectPayload {
                organization_id: org.id,
                name: project.name.clone(),
                metadata: None,
            })
            .await?;

        // Link the local project to the remote project
        Project::set_remote_project_id(&self.db.pool, project.id, Some(remote_project.id)).await?;

        info!(
            project_id = %project.id,
            remote_project_id = %remote_project.id,
            "Auto-linked local project to remote project"
        );

        Ok(remote_project.id)
    }
}
