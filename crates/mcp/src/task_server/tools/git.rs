use rmcp::{
    ErrorData, handler::server::wrapper::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::McpServer;

// ── git_status ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct GitStatusRequest {
    #[schemars(description = "Workspace ID. Optional if running inside that workspace context.")]
    workspace_id: Option<Uuid>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct RepoBranchStatusSummary {
    #[schemars(description = "Repository ID")]
    repo_id: String,
    #[schemars(description = "Repository name")]
    repo_name: String,
    #[schemars(description = "Target branch this workspace branch is based on")]
    target_branch_name: String,
    #[schemars(description = "Number of commits ahead of the target branch")]
    commits_ahead: Option<usize>,
    #[schemars(description = "Number of commits behind the target branch")]
    commits_behind: Option<usize>,
    #[schemars(description = "Whether there are uncommitted changes in the working tree")]
    has_uncommitted_changes: Option<bool>,
    #[schemars(description = "Number of modified/staged files")]
    uncommitted_count: Option<usize>,
    #[schemars(description = "Number of untracked files")]
    untracked_count: Option<usize>,
    #[schemars(description = "Whether a rebase is currently in progress")]
    is_rebase_in_progress: bool,
    #[schemars(description = "List of files with merge/rebase conflicts")]
    conflicted_files: Vec<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct GitStatusResponse {
    workspace_id: String,
    repos: Vec<RepoBranchStatusSummary>,
}

// Raw deserialization struct matching the flattened backend response
#[derive(Debug, Deserialize)]
struct RawRepoBranchStatus {
    repo_id: Uuid,
    repo_name: String,
    target_branch_name: String,
    commits_ahead: Option<usize>,
    commits_behind: Option<usize>,
    has_uncommitted_changes: Option<bool>,
    uncommitted_count: Option<usize>,
    untracked_count: Option<usize>,
    is_rebase_in_progress: bool,
    #[serde(default)]
    conflicted_files: Vec<String>,
}

// ── git_push ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct GitPushRequest {
    #[schemars(description = "Workspace ID. Optional if running inside that workspace context.")]
    workspace_id: Option<Uuid>,
    #[schemars(description = "Repository ID to push. Use `list_repos` to find repo IDs.")]
    repo_id: Uuid,
}

#[derive(Debug, Serialize)]
struct PushPayload {
    repo_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct GitPushResponse {
    success: bool,
    workspace_id: String,
    repo_id: String,
}

#[tool_router(router = git_tools_router, vis = "pub")]
impl McpServer {
    #[tool(
        description = "Get the git branch status for all repositories in a workspace. Returns ahead/behind commit counts relative to the target branch, uncommitted change counts, and whether a rebase or merge conflict is in progress. Useful before creating a pull request or pushing. `workspace_id` is optional if running inside that workspace context."
    )]
    async fn git_status(
        &self,
        Parameters(GitStatusRequest { workspace_id }): Parameters<GitStatusRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let workspace_id = match self.resolve_workspace_id(workspace_id) {
            Ok(id) => id,
            Err(e) => return Ok(Self::tool_error(e)),
        };
        if let Err(e) = self.scope_allows_workspace(workspace_id) {
            return Ok(Self::tool_error(e));
        }

        let url = self.url(&format!("/api/workspaces/{}/git/status", workspace_id));
        let statuses: Vec<RawRepoBranchStatus> = match self.send_json(self.client.get(&url)).await {
            Ok(s) => s,
            Err(e) => return Ok(Self::tool_error(e)),
        };

        let repos = statuses
            .into_iter()
            .map(|s| RepoBranchStatusSummary {
                repo_id: s.repo_id.to_string(),
                repo_name: s.repo_name,
                target_branch_name: s.target_branch_name,
                commits_ahead: s.commits_ahead,
                commits_behind: s.commits_behind,
                has_uncommitted_changes: s.has_uncommitted_changes,
                uncommitted_count: s.uncommitted_count,
                untracked_count: s.untracked_count,
                is_rebase_in_progress: s.is_rebase_in_progress,
                conflicted_files: s.conflicted_files,
            })
            .collect();

        Self::success(&GitStatusResponse {
            workspace_id: workspace_id.to_string(),
            repos,
        })
    }

    #[tool(
        description = "Push a workspace branch to its remote. Returns success or a 'force_push_required' error if the remote has diverged. Use `git_status` first to check for uncommitted changes. `workspace_id` is optional if running inside that workspace context."
    )]
    async fn git_push(
        &self,
        Parameters(GitPushRequest {
            workspace_id,
            repo_id,
        }): Parameters<GitPushRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let workspace_id = match self.resolve_workspace_id(workspace_id) {
            Ok(id) => id,
            Err(e) => return Ok(Self::tool_error(e)),
        };
        if let Err(e) = self.scope_allows_workspace(workspace_id) {
            return Ok(Self::tool_error(e));
        }

        let url = self.url(&format!("/api/workspaces/{}/git/push", workspace_id));
        let payload = PushPayload { repo_id };
        if let Err(e) = self
            .send_empty_json(self.client.post(&url).json(&payload))
            .await
        {
            return Ok(Self::tool_error(e));
        }

        Self::success(&GitPushResponse {
            success: true,
            workspace_id: workspace_id.to_string(),
            repo_id: repo_id.to_string(),
        })
    }
}
