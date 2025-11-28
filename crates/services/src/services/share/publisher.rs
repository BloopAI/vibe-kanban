use db::{
    DBService,
    models::{
        project::Project,
        task::{CreateTask, Task, TaskStatus},
    },
};
use remote::routes::tasks::{
    AssignSharedTaskRequest, CreateSharedTaskRequest, DeleteSharedTaskRequest, SharedTaskResponse,
    UpdateSharedTaskRequest,
};
use uuid::Uuid;

use super::{ShareError, status};
use crate::services::remote_client::RemoteClient;

#[derive(Clone)]
pub struct SharePublisher {
    db: DBService,
    client: RemoteClient,
}

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
            version: None,
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
        version: Option<i64>,
    ) -> Result<SharedTaskResponse, ShareError> {
        let assignee_uuid = new_assignee_user_id
            .map(|id| uuid::Uuid::parse_str(&id))
            .transpose()
            .map_err(|_| ShareError::InvalidUserId)?;

        let payload = AssignSharedTaskRequest {
            new_assignee_user_id: assignee_uuid,
            version,
        };

        let response = self
            .client
            .assign_shared_task(shared_task_id, &payload)
            .await?;

        Ok(response)
    }

    pub async fn delete_shared_task(&self, shared_task_id: Uuid) -> Result<(), ShareError> {
        // We do not have version here anymore if we don't have local shared task.
        // Assuming optimistic locking is less critical for unshare or we accept any version (None).
        // Or we should fetch from remote first?
        // For unshare, usually we just want to break the link. The remote task is "deleted" (soft delete).

        let payload = DeleteSharedTaskRequest { version: None };

        self.client
            .delete_shared_task(shared_task_id, &payload)
            .await?;

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
    ) -> Result<Task, ShareError> {
        if let Some(task) = Task::find_by_shared_task_id(&self.db.pool, shared_task.id).await? {
            return Ok(task);
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

        Ok(task)
    }
}
