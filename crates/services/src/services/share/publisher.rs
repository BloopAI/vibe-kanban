use db::{
    DBService,
    models::{project::Project, shared_task::SharedTask, task::Task},
};
use remote::routes::tasks::{
    AssignSharedTaskRequest, CreateSharedTaskRequest, DeleteSharedTaskRequest, SharedTaskResponse,
    UpdateSharedTaskRequest,
};
use uuid::Uuid;

use super::{ShareError, convert_remote_task, status};
use crate::services::remote_client::RemoteClient;

#[derive(Clone)]
pub struct SharePublisher {
    db: DBService,
    client: RemoteClient,
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

        self.sync_shared_task(&task, &remote_task).await?;
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

        let remote_task = self
            .client
            .update_shared_task(shared_task_id, &payload)
            .await?;

        self.sync_shared_task(task, &remote_task).await?;

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
        shared_task: &SharedTask,
        new_assignee_user_id: Option<String>,
        version: Option<i64>,
    ) -> Result<SharedTask, ShareError> {
        let assignee_uuid = new_assignee_user_id
            .map(|id| uuid::Uuid::parse_str(&id))
            .transpose()
            .map_err(|_| ShareError::InvalidUserId)?;

        let payload = AssignSharedTaskRequest {
            new_assignee_user_id: assignee_uuid,
            version,
        };

        let SharedTaskResponse {
            task: remote_task,
            user,
        } = self
            .client
            .assign_shared_task(shared_task.id, &payload)
            .await?;

        let input = convert_remote_task(&remote_task, user.as_ref(), None);
        let record = SharedTask::upsert(&self.db.pool, input).await?;
        Ok(record)
    }

    pub async fn delete_shared_task(&self, shared_task_id: Uuid) -> Result<(), ShareError> {
        let shared_task = SharedTask::find_by_id(&self.db.pool, shared_task_id)
            .await?
            .ok_or(ShareError::TaskNotFound(shared_task_id))?;

        let payload = DeleteSharedTaskRequest {
            version: Some(shared_task.version),
        };

        self.client
            .delete_shared_task(shared_task.id, &payload)
            .await?;

        if let Some(local_task) =
            Task::find_by_shared_task_id(&self.db.pool, shared_task.id).await?
        {
            Task::set_shared_task_id(&self.db.pool, local_task.id, None).await?;
        }

        SharedTask::remove(&self.db.pool, shared_task.id).await?;
        Ok(())
    }

    async fn sync_shared_task(
        &self,
        task: &Task,
        remote_task: &SharedTaskResponse,
    ) -> Result<(), ShareError> {
        let SharedTaskResponse {
            task: remote_task,
            user,
        } = remote_task;

        Project::find_by_id(&self.db.pool, task.project_id)
            .await?
            .ok_or(ShareError::ProjectNotFound(task.project_id))?;

        let input = convert_remote_task(remote_task, user.as_ref(), None);
        SharedTask::upsert(&self.db.pool, input).await?;
        Task::set_shared_task_id(&self.db.pool, task.id, Some(remote_task.id)).await?;
        Ok(())
    }
}
