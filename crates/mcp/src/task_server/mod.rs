mod handler;
mod tools;

use std::path::{Path, PathBuf};

use anyhow::Context;
use db::models::{
    requests::ContainerQuery,
    session::Session,
    workspace::{Workspace, WorkspaceContext},
    workspace_repo::RepoWithTargetBranch,
};
use rmcp::{handler::server::tool::ToolRouter, schemars};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub(crate) use crate::ApiResponseEnvelope;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, schemars::JsonSchema)]
pub struct McpRepoContext {
    #[schemars(description = "The unique identifier of the repository")]
    pub repo_id: Uuid,
    #[schemars(description = "The name of the repository")]
    pub repo_name: String,
    #[schemars(description = "The target branch for this repository in this workspace")]
    pub target_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, schemars::JsonSchema)]
pub struct McpContext {
    #[schemars(description = "The organization ID (if workspace is linked to remote)")]
    pub organization_id: Option<Uuid>,
    #[schemars(description = "The remote project ID (if workspace is linked to remote)")]
    pub project_id: Option<Uuid>,
    #[schemars(description = "The remote issue ID (if workspace is linked to a remote issue)")]
    pub issue_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(description = "The orchestrator session ID when running in orchestrator mode")]
    pub orchestrator_session_id: Option<Uuid>,
    pub workspace_id: Uuid,
    pub workspace_branch: String,
    #[schemars(
        description = "Repository info and target branches for each repo in this workspace"
    )]
    pub workspace_repos: Vec<McpRepoContext>,
}

#[derive(Debug, Clone)]
pub enum McpMode {
    Global,
    Orchestrator,
}

#[derive(Debug, Clone)]
pub struct McpServer {
    client: reqwest::Client,
    base_url: String,
    tool_router: ToolRouter<McpServer>,
    context: Option<McpContext>,
    mode: McpMode,
    orchestrator_session_id: Option<Uuid>,
}

impl McpServer {
    pub fn new_global(base_url: &str) -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url: base_url.to_string(),
            tool_router: Self::global_mode_router(),
            context: None,
            mode: McpMode::Global,
            orchestrator_session_id: None,
        }
    }

    pub fn new_orchestrator(base_url: &str, orchestrator_session_id: Option<Uuid>) -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url: base_url.to_string(),
            tool_router: Self::orchestrator_mode_router(),
            context: None,
            mode: McpMode::Orchestrator,
            orchestrator_session_id,
        }
    }

    fn url(&self, path: &str) -> String {
        format!(
            "{}/{}",
            self.base_url.trim_end_matches('/'),
            path.trim_start_matches('/')
        )
    }

    pub async fn init(mut self) -> anyhow::Result<Self> {
        let context = self.fetch_context_at_startup().await?;

        if context.is_none() {
            self.tool_router.map.remove("get_context");
            tracing::debug!("VK context not available, get_context tool will not be registered");
        } else {
            tracing::info!("VK context loaded, get_context tool available");
        }

        self.context = context;
        Ok(self)
    }

    pub fn mode(&self) -> &McpMode {
        &self.mode
    }

    async fn fetch_context_at_startup(&self) -> anyhow::Result<Option<McpContext>> {
        let current_dir = std::env::current_dir().context("Failed to resolve current directory")?;
        let canonical_path = current_dir.canonicalize().unwrap_or(current_dir);
        let normalized_path = utils::path::normalize_macos_private_alias(&canonical_path);
        let orchestrator_session = self.fetch_orchestrator_session().await?;

        match self.try_fetch_attempt_context(&normalized_path).await {
            Ok(Some(ctx)) => {
                if let Some(session) = orchestrator_session.as_ref()
                    && session.workspace_id != ctx.workspace.id
                {
                    return self
                        .fetch_orchestrator_context_from_session(session, &normalized_path)
                        .await
                        .map(Some);
                }

                Ok(Some(
                    self.build_mcp_context_from_workspace_context(
                        &ctx,
                        orchestrator_session.as_ref(),
                    )
                    .await,
                ))
            }
            Ok(None) | Err(_) if matches!(self.mode(), McpMode::Global) => Ok(None),
            Ok(None) | Err(_) => {
                let Some(session) = orchestrator_session.as_ref() else {
                    anyhow::bail!(
                        "Failed to load orchestrator MCP context: no orchestrator session was available"
                    );
                };

                self.fetch_orchestrator_context_from_session(session, &normalized_path)
                    .await
                    .map(Some)
            }
        }
    }

    async fn try_fetch_attempt_context(
        &self,
        path: &Path,
    ) -> anyhow::Result<Option<WorkspaceContext>> {
        let url = self.url("/api/containers/attempt-context");
        let query = ContainerQuery {
            container_ref: path.to_string_lossy().to_string(),
        };

        let response = tokio::time::timeout(
            std::time::Duration::from_millis(500),
            self.client.get(&url).query(&query).send(),
        )
        .await
        .context("Timed out fetching /api/containers/attempt-context")?
        .context("Failed to fetch /api/containers/attempt-context")?;

        if !response.status().is_success() {
            return Ok(None);
        }

        let api_response: ApiResponseEnvelope<WorkspaceContext> = response
            .json()
            .await
            .context("Failed to parse /api/containers/attempt-context response")?;

        if !api_response.success {
            return Ok(None);
        }

        Ok(api_response.data)
    }

    async fn fetch_orchestrator_session(&self) -> anyhow::Result<Option<Session>> {
        let Some(session_id) = self.orchestrator_session_id else {
            return Ok(None);
        };

        let session = self
            .fetch_json::<Session>(&format!("/api/sessions/{session_id}"))
            .await
            .with_context(|| format!("Failed to resolve orchestrator session {session_id}"))?;

        Ok(Some(session))
    }

    async fn fetch_orchestrator_context_from_session(
        &self,
        session: &Session,
        current_dir: &Path,
    ) -> anyhow::Result<McpContext> {
        let workspace: Workspace = self
            .fetch_json(&format!("/api/workspaces/{}", session.workspace_id))
            .await
            .with_context(|| {
                format!(
                    "Failed to resolve workspace {} for orchestrator session {}",
                    session.workspace_id, session.id
                )
            })?;
        let workspace_root = workspace
            .container_ref
            .as_deref()
            .filter(|path| !path.is_empty())
            .map(PathBuf::from)
            .with_context(|| {
                format!(
                    "Workspace {} is missing container_ref for orchestrator MCP startup",
                    workspace.id
                )
            })?;

        if !Self::current_dir_matches_workspace(current_dir, &workspace_root, session) {
            anyhow::bail!(
                "Failed to load orchestrator MCP context: current directory {} is outside workspace {}",
                current_dir.display(),
                workspace_root.display()
            );
        }

        let workspace_repos: Vec<RepoWithTargetBranch> = self
            .fetch_json(&format!("/api/workspaces/{}/repos", workspace.id))
            .await
            .with_context(|| format!("Failed to resolve repos for workspace {}", workspace.id))?;

        let ctx = WorkspaceContext {
            workspace,
            workspace_repos,
            orchestrator_session_id: Some(session.id),
        };

        Ok(self
            .build_mcp_context_from_workspace_context(&ctx, Some(session))
            .await)
    }

    async fn fetch_json<T: for<'de> Deserialize<'de>>(&self, path: &str) -> anyhow::Result<T> {
        let response = self
            .client
            .get(self.url(path))
            .send()
            .await
            .with_context(|| format!("Failed to fetch {path}"))?;

        if !response.status().is_success() {
            anyhow::bail!("{path} returned {}", response.status());
        }

        let api_response: ApiResponseEnvelope<T> = response
            .json()
            .await
            .with_context(|| format!("Failed to parse response from {path}"))?;

        if !api_response.success {
            anyhow::bail!("{path} returned an unsuccessful API response");
        }

        api_response
            .data
            .with_context(|| format!("{path} response was missing data"))
    }

    async fn build_mcp_context_from_workspace_context(
        &self,
        ctx: &WorkspaceContext,
        orchestrator_session: Option<&Session>,
    ) -> McpContext {
        let workspace_repos: Vec<McpRepoContext> = ctx
            .workspace_repos
            .iter()
            .map(|rwb| McpRepoContext {
                repo_id: rwb.repo.id,
                repo_name: rwb.repo.name.clone(),
                target_branch: rwb.target_branch.clone(),
            })
            .collect();

        let workspace_id = ctx.workspace.id;
        let workspace_branch = ctx.workspace.branch.clone();
        let orchestrator_session_id = if matches!(self.mode(), McpMode::Orchestrator) {
            orchestrator_session
                .map(|session| session.id)
                .or(ctx.orchestrator_session_id)
        } else {
            None
        };

        let (project_id, issue_id, organization_id) = self
            .fetch_remote_workspace_context(workspace_id)
            .await
            .unwrap_or((None, None, None));

        McpContext {
            organization_id,
            project_id,
            issue_id,
            orchestrator_session_id,
            workspace_id,
            workspace_branch,
            workspace_repos,
        }
    }

    fn current_dir_matches_workspace(
        current_dir: &Path,
        workspace_root: &Path,
        session: &Session,
    ) -> bool {
        if current_dir.starts_with(workspace_root) {
            return true;
        }

        session
            .agent_working_dir
            .as_deref()
            .filter(|path| !path.is_empty())
            .map(|path| workspace_root.join(path))
            .is_some_and(|session_path| current_dir.starts_with(session_path))
    }

    async fn fetch_remote_workspace_context(
        &self,
        local_workspace_id: Uuid,
    ) -> Option<(Option<Uuid>, Option<Uuid>, Option<Uuid>)> {
        let url = self.url(&format!(
            "/api/remote/workspaces/by-local-id/{}",
            local_workspace_id
        ));

        let response = tokio::time::timeout(
            std::time::Duration::from_millis(2000),
            self.client.get(&url).send(),
        )
        .await
        .ok()?
        .ok()?;

        if !response.status().is_success() {
            return None;
        }

        let api_response: ApiResponseEnvelope<api_types::Workspace> = response.json().await.ok()?;

        if !api_response.success {
            return None;
        }

        let remote_ws = api_response.data?;
        let project_id = remote_ws.project_id;

        // Fetch the project to get organization_id
        let org_id = self.fetch_remote_organization_id(project_id).await;

        Some((Some(project_id), remote_ws.issue_id, org_id))
    }

    async fn fetch_remote_organization_id(&self, project_id: Uuid) -> Option<Uuid> {
        let url = self.url(&format!("/api/remote/projects/{}", project_id));

        let response = tokio::time::timeout(
            std::time::Duration::from_millis(2000),
            self.client.get(&url).send(),
        )
        .await
        .ok()?
        .ok()?;

        if !response.status().is_success() {
            return None;
        }

        let api_response: ApiResponseEnvelope<api_types::Project> = response.json().await.ok()?;
        let project = api_response.data?;
        Some(project.organization_id)
    }
}
