use std::{sync::Arc, time::Duration};

use db::{
    DBService,
    models::{
        project::{Project, ProjectRemoteMetadata},
        shared_task::SharedTask,
        task::Task,
    },
};
use remote::db::tasks::{SharedTask as RemoteSharedTask, TaskStatus as RemoteTaskStatus};
use reqwest::{Client as HttpClient, StatusCode};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use uuid::Uuid;

use super::{RemoteSyncConfig, ShareError, convert_local_status, convert_remote_task};
use crate::services::{config::Config, git::GitService, github_service::GitHubService};

#[derive(Clone)]
pub struct ShareTaskPublisher {
    db: DBService,
    config: RemoteSyncConfig,
    client: HttpClient,
    metadata: Option<MetadataContext>,
}

#[derive(Clone)]
struct MetadataContext {
    git: GitService,
    user_config: Arc<RwLock<Config>>,
}

impl ShareTaskPublisher {
    pub fn new(db: DBService) -> Result<Self, ShareError> {
        Self::new_with_metadata_context(db, None)
    }

    pub fn new_with_metadata(
        db: DBService,
        git: GitService,
        user_config: Arc<RwLock<Config>>,
    ) -> Result<Self, ShareError> {
        let context = MetadataContext { git, user_config };
        Self::new_with_metadata_context(db, Some(context))
    }

    fn new_with_metadata_context(
        db: DBService,
        metadata: Option<MetadataContext>,
    ) -> Result<Self, ShareError> {
        let config = RemoteSyncConfig::from_env()
            .ok_or(ShareError::MissingConfig("share not configured"))?;

        let client = HttpClient::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(ShareError::Transport)?;

        Ok(Self {
            db,
            config,
            client,
            metadata,
        })
    }

    pub async fn share_task(&self, task_id: Uuid) -> Result<Uuid, ShareError> {
        let task = Task::find_by_id(&self.db.pool, task_id)
            .await?
            .ok_or(ShareError::TaskNotFound(task_id))?;

        let project = Project::find_by_id(&self.db.pool, task.project_id)
            .await?
            .ok_or(ShareError::ProjectNotFound(task.project_id))?;

        let project = self.ensure_project_metadata(project).await?;

        let metadata = ProjectMetadata::try_from(&project)?;

        let payload = CreateSharedTaskRequest {
            project_id: project.id,
            project: Some(metadata),
            title: task.title.clone(),
            description: task.description.clone(),
            assignee_member_id: Some(self.config.member_id),
        };

        let response = self
            .client
            .post(self.config.create_task_endpoint())
            .json(&payload)
            .send()
            .await
            .map_err(ShareError::Transport)?;

        if response.status() == StatusCode::CONFLICT {
            tracing::warn!(task_id = %task_id, "remote task already exists; skipping create");
            if let Some(existing_shared) = task.shared_task_id {
                return Ok(existing_shared);
            }
            return Err(ShareError::InvalidResponse);
        }

        let response = response.error_for_status().map_err(ShareError::Transport)?;
        let resp_body: CreateTaskResponse = response.json().await?;

        let input = convert_remote_task(&resp_body.task, None);
        SharedTask::upsert(&self.db.pool, input).await?;
        Task::set_shared_task_id(&self.db.pool, task.id, Some(resp_body.task.id)).await?;

        Ok(resp_body.task.id)
    }

    pub async fn update_shared_task(&self, task: &Task) -> Result<(), ShareError> {
        let Some(shared_task_id) = task.shared_task_id else {
            return Ok(());
        };

        let payload = UpdateSharedTaskRequest {
            title: Some(task.title.clone()),
            description: task.description.clone(),
            status: Some(convert_local_status(&task.status)),
            version: None,
        };

        let response = self
            .client
            .patch(self.config.update_task_endpoint(shared_task_id))
            .json(&payload)
            .send()
            .await
            .map_err(ShareError::Transport)?;

        let response = response.error_for_status().map_err(ShareError::Transport)?;
        let resp_body: UpdateTaskResponse = response.json().await?;

        let input = convert_remote_task(&resp_body.task, None);
        SharedTask::upsert(&self.db.pool, input).await?;
        Task::set_shared_task_id(&self.db.pool, task.id, Some(shared_task_id)).await?;

        Ok(())
    }

    pub async fn update_shared_task_by_id(&self, task_id: Uuid) -> Result<(), ShareError> {
        let task = Task::find_by_id(&self.db.pool, task_id)
            .await?
            .ok_or(ShareError::TaskNotFound(task_id))?;

        self.update_shared_task(&task).await
    }

    /// Check and populate missing project metadata needed for sharing tasks.
    async fn ensure_project_metadata(&self, project: Project) -> Result<Project, ShareError> {
        let Some(context) = &self.metadata else {
            return Ok(project);
        };

        let mut project = project;
        let original_metadata = ProjectRemoteMetadata::from_project(&project);
        let mut metadata = original_metadata.clone();

        if metadata.github_repo_owner.is_none()
            || metadata.github_repo_name.is_none()
            || !metadata.has_remote
        {
            match context
                .git
                .get_remote_metadata(project.git_repo_path.as_path())
            {
                Ok(git_metadata) => {
                    metadata.has_remote = git_metadata.has_remote;
                    if let Some(owner) = git_metadata.github_repo_owner {
                        metadata.github_repo_owner = Some(owner);
                    }
                    if let Some(name) = git_metadata.github_repo_name {
                        metadata.github_repo_name = Some(name);
                    }
                }
                Err(err) => {
                    tracing::debug!(
                        ?err,
                        project_id = %project.id,
                        "Failed to read git metadata when preparing shared task"
                    );
                }
            }
        }

        if metadata.github_repo_owner.is_some()
            && metadata.github_repo_name.is_some()
            && metadata.github_repo_id.is_none()
        {
            let github_token = {
                let cfg = context.user_config.read().await;
                cfg.github.token()
            };

            if let Some(token) = github_token {
                match GitHubService::new(&token) {
                    Ok(service) => {
                        let owner = metadata.github_repo_owner.clone().unwrap();
                        let repo = metadata.github_repo_name.clone().unwrap();
                        match service.fetch_repository_id(&owner, &repo).await {
                            Ok(id) => metadata.github_repo_id = Some(id),
                            Err(err) => {
                                tracing::warn!(
                                    ?err,
                                    project_id = %project.id,
                                    owner,
                                    repo,
                                    "Failed to fetch repository id when preparing shared task"
                                );
                            }
                        }
                    }
                    Err(err) => {
                        tracing::warn!(
                            ?err,
                            project_id = %project.id,
                            "Failed to construct GitHub client when preparing shared task"
                        );
                    }
                }
            } else {
                tracing::debug!(
                    project_id = %project.id,
                    "GitHub token not configured; skipping repository id fetch for shared task"
                );
            }
        }

        if metadata != original_metadata {
            Project::update_remote_metadata(&self.db.pool, project.id, &metadata).await?;
            project.has_remote = metadata.has_remote;
            project.github_repo_owner = metadata.github_repo_owner.clone();
            project.github_repo_name = metadata.github_repo_name.clone();
            project.github_repo_id = metadata.github_repo_id;
        }

        Ok(project)
    }
}

#[derive(Debug, Deserialize)]
struct CreateTaskResponse {
    task: RemoteSharedTask,
}

#[derive(Debug, Deserialize)]
struct UpdateTaskResponse {
    task: RemoteSharedTask,
}

#[derive(Debug, Serialize)]
struct CreateSharedTaskRequest {
    project_id: Uuid,
    project: Option<ProjectMetadata>,
    title: String,
    description: Option<String>,
    assignee_member_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
struct UpdateSharedTaskRequest {
    title: Option<String>,
    description: Option<String>,
    status: Option<RemoteTaskStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<i64>,
}

#[derive(Debug, Serialize)]
struct ProjectMetadata {
    github_repository_id: i64,
    owner: String,
    name: String,
}

impl TryFrom<&Project> for ProjectMetadata {
    type Error = ShareError;

    fn try_from(project: &Project) -> Result<Self, Self::Error> {
        let missing = || ShareError::MissingProjectMetadata(project.id);

        Ok(Self {
            github_repository_id: project.github_repo_id.ok_or_else(missing)?,
            owner: project.github_repo_owner.clone().ok_or_else(missing)?,
            name: project
                .github_repo_name
                .clone()
                .unwrap_or_else(|| project.name.clone()),
        })
    }
}
