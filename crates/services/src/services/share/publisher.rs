use db::{
    DBService,
    models::{
        project::Project,
        task::{CreateTask, Task, TaskStatus},
    },
};
use remote::routes::tasks::{
    AssignSharedTaskRequest, CreateSharedTaskRequest, SharedTaskResponse, UpdateSharedTaskRequest,
};
use uuid::Uuid;

use super::{ShareError, status};
use crate::services::remote_client::RemoteClient;

#[derive(Clone)]
pub struct SharePublisher {
    db: DBService,
    client: RemoteClient,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, ts_rs::TS)]
pub struct SharedTaskDetails {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
}

impl SharePublisher {
    pub fn new(db: DBService, client: RemoteClient) -> Self {
        Self { db, client }
    }

    pub async fn share_task(&self, task_id: Uuid, user_id: Uuid) -> Result<Uuid, ShareError> {
        let task = Task::find_by_id(&self.db.pool, task_id)
            .await?
            .ok_or(ShareError::TaskNotFound(task_id))?;

        if task.shared_task_id.is_some() {
            return Err(ShareError::AlreadyShared(task.id));
        }

        let project = Project::find_by_id(&self.db.pool, task.project_id)
            .await?
            .ok_or(ShareError::ProjectNotFound(task.project_id))?;
        let remote_project_id = project
            .remote_project_id
            .ok_or(ShareError::ProjectNotLinked(project.id))?;

        let payload = CreateSharedTaskRequest {
            project_id: remote_project_id,
            title: task.title.clone(),
            description: task.description.clone(),
            assignee_user_id: Some(user_id),
        };

        let remote_task = self.client.create_shared_task(&payload).await?;

        Task::set_shared_task_id(&self.db.pool, task.id, Some(remote_task.task.id)).await?;
        Ok(remote_task.task.id)
    }

    pub async fn update_shared_task(&self, task: &Task) -> Result<(), ShareError> {
        // early exit if task has not been shared
        let Some(shared_task_id) = task.shared_task_id else {
            return Ok(());
        };

        let payload = UpdateSharedTaskRequest {
            title: Some(task.title.clone()),
            description: task.description.clone(),
            status: Some(status::to_remote(&task.status)),
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

    pub async fn assign_shared_task(
        &self,
        shared_task_id: Uuid,
        new_assignee_user_id: Option<String>,
    ) -> Result<SharedTaskResponse, ShareError> {
        let assignee_uuid = new_assignee_user_id
            .map(|id| uuid::Uuid::parse_str(&id))
            .transpose()
            .map_err(|_| ShareError::InvalidUserId)?;

        let payload = AssignSharedTaskRequest {
            new_assignee_user_id: assignee_uuid,
        };

        let response = self
            .client
            .assign_shared_task(shared_task_id, &payload)
            .await?;

        Ok(response)
    }

    pub async fn delete_shared_task(&self, shared_task_id: Uuid) -> Result<(), ShareError> {
        self.client.delete_shared_task(shared_task_id).await?;

        if let Some(local_task) =
            Task::find_by_shared_task_id(&self.db.pool, shared_task_id).await?
        {
            Task::set_shared_task_id(&self.db.pool, local_task.id, None).await?;
        }

        Ok(())
    }

    pub async fn link_shared_task(
        &self,
        shared_task: SharedTaskDetails,
    ) -> Result<Option<Task>, ShareError> {
        if let Some(task) = Task::find_by_shared_task_id(&self.db.pool, shared_task.id).await? {
            return Ok(Some(task));
        }

        if !self.shared_task_exists(shared_task.id).await? {
            return Ok(None);
        }

        let create_task = CreateTask::from_shared_task(
            shared_task.project_id,
            shared_task.title,
            shared_task.description,
            shared_task.status,
            shared_task.id,
        );

        let id = Uuid::new_v4();
        let task = Task::create(&self.db.pool, &create_task, id).await?;

        Ok(Some(task))
    }

    async fn shared_task_exists(&self, shared_task_id: Uuid) -> Result<bool, ShareError> {
        Ok(self
            .client
            .check_tasks(vec![shared_task_id])
            .await?
            .contains(&shared_task_id))
    }

    pub async fn cleanup_shared_tasks(&self) -> Result<(), ShareError> {
        let tasks = Task::find_all_shared(&self.db.pool).await?;
        if tasks.is_empty() {
            return Ok(());
        }

        let shared_ids: Vec<Uuid> = tasks.iter().filter_map(|t| t.shared_task_id).collect();

        if shared_ids.is_empty() {
            return Ok(());
        }

        // Verify in chunks of 100 to avoid hitting payload limits
        for chunk in shared_ids.chunks(100) {
            let existing_ids = match self.client.check_tasks(chunk.to_vec()).await {
                Ok(ids) => ids,
                Err(e) => {
                    tracing::warn!("Failed to check task existence: {}", e);
                    continue;
                }
            };

            let existing_set: std::collections::HashSet<Uuid> = existing_ids.into_iter().collect();

            let missing_ids: Vec<Uuid> = chunk
                .iter()
                .filter(|id| !existing_set.contains(id))
                .cloned()
                .collect();

            if !missing_ids.is_empty() {
                tracing::info!(
                    "Unlinking ({}) shared tasks that no longer exist in remote",
                    missing_ids.len()
                );

                if let Err(e) = Task::batch_unlink_shared_tasks(&self.db.pool, &missing_ids).await {
                    tracing::error!("Failed to batch unlink tasks: {}", e);
                }
            }
        }

        Ok(())
    }
}
