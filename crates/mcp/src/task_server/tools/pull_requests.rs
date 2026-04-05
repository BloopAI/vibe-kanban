use rmcp::{
    ErrorData, handler::server::wrapper::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::McpServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CreatePullRequestRequest {
    #[schemars(description = "Workspace ID. Optional if running inside that workspace context.")]
    workspace_id: Option<Uuid>,
    #[schemars(
        description = "Repository ID to create the PR for. Use `list_repos` to find repo IDs."
    )]
    repo_id: Uuid,
    #[schemars(description = "Pull request title")]
    title: String,
    #[schemars(description = "Optional PR description body. Supports markdown.")]
    body: Option<String>,
    #[schemars(description = "Create as a draft PR (default: false)")]
    draft: Option<bool>,
    #[schemars(
        description = "Target branch to merge into. Defaults to the repo's default target branch."
    )]
    target_branch: Option<String>,
}

#[derive(Debug, Serialize)]
struct CreatePrPayload {
    title: String,
    body: Option<String>,
    target_branch: Option<String>,
    draft: Option<bool>,
    repo_id: Uuid,
    auto_generate_description: bool,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct CreatePullRequestResponse {
    #[schemars(description = "URL of the created pull request")]
    pr_url: String,
}

#[tool_router(router = pull_requests_tools_router, vis = "pub")]
impl McpServer {
    #[tool(
        description = "Create a pull request from a workspace branch. Automatically pushes the branch to the remote before creating the PR. Returns the PR URL on success. Use `git_status` first to verify there are no uncommitted changes. `workspace_id` is optional if running inside that workspace context."
    )]
    async fn create_pull_request(
        &self,
        Parameters(CreatePullRequestRequest {
            workspace_id,
            repo_id,
            title,
            body,
            draft,
            target_branch,
        }): Parameters<CreatePullRequestRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let title = title.trim().to_string();
        if title.is_empty() {
            return Self::err("title must not be empty", None::<&str>);
        }

        let workspace_id = match self.resolve_workspace_id(workspace_id) {
            Ok(id) => id,
            Err(e) => return Ok(Self::tool_error(e)),
        };
        if let Err(e) = self.scope_allows_workspace(workspace_id) {
            return Ok(Self::tool_error(e));
        }

        let payload = CreatePrPayload {
            title,
            body,
            target_branch,
            draft,
            repo_id,
            auto_generate_description: false,
        };

        let url = self.url(&format!("/api/workspaces/{}/pull-requests", workspace_id));

        let pr_url: String = match self.send_json(self.client.post(&url).json(&payload)).await {
            Ok(url) => url,
            Err(e) => return Ok(Self::tool_error(e)),
        };

        Self::success(&CreatePullRequestResponse { pr_url })
    }
}
