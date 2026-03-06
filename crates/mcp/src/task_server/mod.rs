mod handler;
mod tools;

use db::models::{requests::ContainerQuery, workspace::WorkspaceContext};
use rmcp::{handler::server::tool::ToolRouter, schemars};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
struct ApiResponseEnvelope<T> {
    success: bool,
    data: Option<T>,
    message: Option<String>,
}

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
    pub workspace_id: Uuid,
    pub workspace_branch: String,
    #[schemars(
        description = "Repository info and target branches for each repo in this workspace"
    )]
    pub workspace_repos: Vec<McpRepoContext>,
}

#[derive(Debug, Clone)]
pub struct TaskServer {
    client: reqwest::Client,
    base_url: String,
    tool_router: ToolRouter<TaskServer>,
    context: Option<McpContext>,
}

impl TaskServer {
    fn url(&self, path: &str) -> String {
        format!(
            "{}/{}",
            self.base_url.trim_end_matches('/'),
            path.trim_start_matches('/')
        )
    }

    pub async fn init(mut self) -> Self {
        let context = self.fetch_context_at_startup().await;

        if context.is_none() {
            self.tool_router.map.remove("get_context");
            tracing::debug!("VK context not available, get_context tool will not be registered");
        } else {
            tracing::info!("VK context loaded, get_context tool available");
        }

        self.context = context;
        self
    }

    async fn fetch_context_at_startup(&self) -> Option<McpContext> {
        let current_dir = std::env::current_dir().ok()?;
        let canonical_path = current_dir.canonicalize().unwrap_or(current_dir);
        let normalized_path = utils::path::normalize_macos_private_alias(&canonical_path);

        let url = self.url("/api/containers/attempt-context");
        let query = ContainerQuery {
            container_ref: normalized_path.to_string_lossy().to_string(),
        };

        let response = tokio::time::timeout(
            std::time::Duration::from_millis(500),
            self.client.get(&url).query(&query).send(),
        )
        .await
        .ok()?
        .ok()?;

        if !response.status().is_success() {
            return None;
        }

        let api_response: ApiResponseEnvelope<WorkspaceContext> = response.json().await.ok()?;

        if !api_response.success {
            return None;
        }

        let ctx = api_response.data?;

        let workspace_repos: Vec<McpRepoContext> = ctx
            .workspace_repos
            .into_iter()
            .map(|rwb| McpRepoContext {
                repo_id: rwb.repo.id,
                repo_name: rwb.repo.name,
                target_branch: rwb.target_branch,
            })
            .collect();

        let workspace_id = ctx.workspace.id;
        let workspace_branch = ctx.workspace.branch.clone();

        // Look up remote workspace to get remote project_id, issue_id, and organization_id
        let (project_id, issue_id, organization_id) = self
            .fetch_remote_workspace_context(workspace_id)
            .await
            .unwrap_or((None, None, None));

        Some(McpContext {
            organization_id,
            project_id,
            issue_id,
            workspace_id,
            workspace_branch,
            workspace_repos,
        })
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
