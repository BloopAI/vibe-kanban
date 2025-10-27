use std::{sync::Arc, time::Duration};

use db::{
    DBService,
    models::{project::Project, shared_task::SharedTask, task::Task},
};
use remote::{
    api::tasks::{
        AssignSharedTaskRequest, CreateSharedTaskRequest, SharedTaskResponse,
        UpdateSharedTaskRequest,
    },
    db::{projects::ProjectMetadata, tasks::SharedTask as RemoteSharedTask},
};
use reqwest::{Client as HttpClient, StatusCode};
use tokio::sync::RwLock;
use uuid::Uuid;

use super::{ShareConfig, ShareError, convert_remote_task, status};
use crate::services::{
    clerk::ClerkSession, config::Config, git::GitService, github_service::GitHubService,
};

#[derive(Clone)]
pub struct SharePublisher {
    db: DBService,
    git: GitService,
    client: HttpClient,
    config: ShareConfig,
    user_config: Arc<RwLock<Config>>,
}

impl SharePublisher {
    pub fn new(
        db: DBService,
        git: GitService,
        user_config: Arc<RwLock<Config>>,
    ) -> Result<Self, ShareError> {
        let config =
            ShareConfig::from_env().ok_or(ShareError::MissingConfig("share not configured"))?;

        let client = HttpClient::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(ShareError::Transport)?;

        Ok(Self {
            db,
            git,
            config,
            user_config,
            client,
        })
    }

    fn resolve_session(&self, provided: Option<&ClerkSession>) -> Result<ClerkSession, ShareError> {
        match provided {
            Some(session) if !session.is_expired() => Ok(session.clone()),
            _ => Err(ShareError::MissingAuth),
        }
    }

    pub async fn share_task(
        &self,
        task_id: Uuid,
        session: Option<&ClerkSession>,
    ) -> Result<Uuid, ShareError> {
        let session = self.resolve_session(session)?;
        let task = Task::find_by_id(&self.db.pool, task_id)
            .await?
            .ok_or(ShareError::TaskNotFound(task_id))?;

        if task.shared_task_id.is_some() {
            return Err(ShareError::AlreadyShared(task.id));
        }

        let project = Project::find_by_id(&self.db.pool, task.project_id)
            .await?
            .ok_or(ShareError::ProjectNotFound(task.project_id))?;
        let project = self.ensure_project_metadata(project).await?;
        let project_metadata = project_metadata_for_remote(&project)?;

        let payload = CreateSharedTaskRequest {
            project: project_metadata,
            title: task.title.clone(),
            description: task.description.clone(),
            assignee_user_id: Some(session.user_id.clone()),
        };

        let remote_task = RemoteTaskClient::new(&self.client, &self.config)
            .create_task(&session, &payload)
            .await?;

        self.sync_shared_task(&task, &remote_task).await?;

        Ok(remote_task.id)
    }

    pub async fn update_shared_task(
        &self,
        task: &Task,
        session: Option<&ClerkSession>,
    ) -> Result<(), ShareError> {
        // early exit if task has not been shared
        let Some(shared_task_id) = task.shared_task_id else {
            return Ok(());
        };

        let session = self.resolve_session(session)?;
        let payload = UpdateSharedTaskRequest {
            title: Some(task.title.clone()),
            description: task.description.clone(),
            status: Some(status::to_remote(&task.status)),
            version: None,
        };

        let remote_task = RemoteTaskClient::new(&self.client, &self.config)
            .update_task(&session, shared_task_id, &payload)
            .await?;

        self.sync_shared_task(task, &remote_task).await?;

        Ok(())
    }

    pub async fn update_shared_task_by_id(
        &self,
        task_id: Uuid,
        session: Option<&ClerkSession>,
    ) -> Result<(), ShareError> {
        let task = Task::find_by_id(&self.db.pool, task_id)
            .await?
            .ok_or(ShareError::TaskNotFound(task_id))?;

        self.update_shared_task(&task, session).await
    }

    pub async fn assign_shared_task(
        &self,
        shared_task: &SharedTask,
        session: Option<&ClerkSession>,
        new_assignee_user_id: Option<String>,
        version: Option<i64>,
    ) -> Result<SharedTask, ShareError> {
        let session = self.resolve_session(session)?;
        let payload = AssignSharedTaskRequest {
            new_assignee_user_id,
            version,
        };

        let remote_task = RemoteTaskClient::new(&self.client, &self.config)
            .assign_task(&session, shared_task.id, &payload)
            .await?;

        let input = convert_remote_task(&remote_task, shared_task.project_id, None);
        let record = SharedTask::upsert(&self.db.pool, input).await?;
        Ok(record)
    }

    async fn sync_shared_task(
        &self,
        task: &Task,
        remote_task: &RemoteSharedTask,
    ) -> Result<(), ShareError> {
        let input = convert_remote_task(remote_task, task.project_id, None);
        SharedTask::upsert(&self.db.pool, input).await?;
        Task::set_shared_task_id(&self.db.pool, task.id, Some(remote_task.id)).await?;
        Ok(())
    }

    /// Check and populate missing project metadata needed for sharing tasks.
    async fn ensure_project_metadata(&self, mut project: Project) -> Result<Project, ShareError> {
        let mut metadata = project.metadata();
        let original = metadata.clone();

        // 1) Fetch missing git remote info
        if metadata.needs_git_enrichment() {
            let new = self
                .git
                .get_remote_metadata(project.git_repo_path.as_path())?;
            metadata = new;
        }

        // 2) Fetch missing GitHub repository ID
        if metadata.needs_repo_id_enrichment()
            && let (Some(owner), Some(name)) = (
                metadata.github_repo_owner.clone(),
                metadata.github_repo_name.clone(),
            )
        {
            let token = {
                let cfg = self.user_config.read().await;
                cfg.github.token()
            }
            .ok_or(ShareError::MissingGitHubToken)?;

            let github = GitHubService::new(&token)?;
            let id = github.fetch_repository_id(&owner, &name).await?;
            metadata.github_repo_id = Some(id);
        }

        // 3) Update project if metadata changed
        if metadata != original {
            Project::update_remote_metadata(&self.db.pool, project.id, &metadata).await?;
            project.has_remote = metadata.has_remote;
            project.github_repo_owner = metadata.github_repo_owner.clone();
            project.github_repo_name = metadata.github_repo_name.clone();
            project.github_repo_id = metadata.github_repo_id;
        }

        Ok(project)
    }
}

struct RemoteTaskClient<'a> {
    http: &'a HttpClient,
    config: &'a ShareConfig,
}

impl<'a> RemoteTaskClient<'a> {
    fn new(http: &'a HttpClient, config: &'a ShareConfig) -> Self {
        Self { http, config }
    }

    async fn create_task(
        &self,
        session: &ClerkSession,
        payload: &CreateSharedTaskRequest,
    ) -> Result<RemoteSharedTask, ShareError> {
        let response = self
            .http
            .post(self.config.create_task_endpoint()?)
            .bearer_auth(session.bearer())
            .json(payload)
            .send()
            .await
            .map_err(ShareError::Transport)?;

        Self::parse_response(response).await
    }

    async fn update_task(
        &self,
        session: &ClerkSession,
        task_id: Uuid,
        payload: &UpdateSharedTaskRequest,
    ) -> Result<RemoteSharedTask, ShareError> {
        let response = self
            .http
            .patch(self.config.update_task_endpoint(task_id)?)
            .bearer_auth(session.bearer())
            .json(payload)
            .send()
            .await
            .map_err(ShareError::Transport)?;

        Self::parse_response(response).await
    }

    async fn assign_task(
        &self,
        session: &ClerkSession,
        task_id: Uuid,
        payload: &AssignSharedTaskRequest,
    ) -> Result<RemoteSharedTask, ShareError> {
        let response = self
            .http
            .post(self.config.assign_endpoint(task_id)?)
            .bearer_auth(session.bearer())
            .json(payload)
            .send()
            .await
            .map_err(ShareError::Transport)?;

        Self::parse_response(response).await
    }

    async fn parse_response(response: reqwest::Response) -> Result<RemoteSharedTask, ShareError> {
        if response.status() == StatusCode::UNAUTHORIZED {
            return Err(ShareError::MissingAuth);
        }

        if response.status() == StatusCode::CONFLICT {
            tracing::warn!("remote share service reported a conflict");
            return Err(ShareError::InvalidResponse);
        }

        let response = response.error_for_status().map_err(ShareError::Transport)?;
        let envelope: SharedTaskResponse = response.json().await.map_err(ShareError::Transport)?;
        Ok(envelope.task)
    }
}

fn project_metadata_for_remote(project: &Project) -> Result<ProjectMetadata, ShareError> {
    let missing = || ShareError::MissingProjectMetadata(project.id);

    Ok(ProjectMetadata {
        github_repository_id: project.github_repo_id.ok_or_else(missing)?,
        owner: project.github_repo_owner.clone().ok_or_else(missing)?,
        name: project
            .github_repo_name
            .clone()
            .unwrap_or_else(|| project.name.clone()),
    })
}
