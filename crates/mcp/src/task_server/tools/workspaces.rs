use db::models::{requests::UpdateWorkspace, workspace::Workspace};
use rmcp::{
    ErrorData, handler::server::tool::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::TaskServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListWorkspacesRequest {
    #[schemars(description = "Filter by archived state")]
    archived: Option<bool>,
    #[schemars(description = "Filter by pinned state")]
    pinned: Option<bool>,
    #[schemars(description = "Filter by branch name (exact match, case-insensitive)")]
    branch: Option<String>,
    #[schemars(description = "Case-insensitive substring match against workspace name")]
    name_search: Option<String>,
    #[schemars(description = "Maximum number of workspaces to return (default: 50)")]
    limit: Option<i32>,
    #[schemars(description = "Number of results to skip before returning rows (default: 0)")]
    offset: Option<i32>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct WorkspaceSummary {
    #[schemars(description = "Workspace ID")]
    id: String,
    #[schemars(description = "Workspace branch")]
    branch: String,
    #[schemars(description = "Whether the workspace is archived")]
    archived: bool,
    #[schemars(description = "Whether the workspace is pinned")]
    pinned: bool,
    #[schemars(description = "Optional workspace display name")]
    name: Option<String>,
    #[schemars(description = "Creation timestamp")]
    created_at: String,
    #[schemars(description = "Last update timestamp")]
    updated_at: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpListWorkspacesResponse {
    workspaces: Vec<WorkspaceSummary>,
    total_count: usize,
    returned_count: usize,
    limit: usize,
    offset: usize,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpUpdateWorkspaceRequest {
    #[schemars(
        description = "Workspace ID to update. Optional if running inside that workspace context."
    )]
    workspace_id: Option<Uuid>,
    #[schemars(description = "Set archived state")]
    archived: Option<bool>,
    #[schemars(description = "Set pinned state")]
    pinned: Option<bool>,
    #[schemars(description = "Set workspace display name (empty string clears it)")]
    name: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpUpdateWorkspaceResponse {
    success: bool,
    workspace_id: String,
    archived: bool,
    pinned: bool,
    name: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpDeleteWorkspaceRequest {
    #[schemars(
        description = "Workspace ID to delete. Optional if running inside that workspace context."
    )]
    workspace_id: Option<Uuid>,
    #[schemars(
        description = "Also delete linked remote workspace when available (default: false)"
    )]
    delete_remote: Option<bool>,
    #[schemars(description = "Also delete workspace branches from repos (default: false)")]
    delete_branches: Option<bool>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpDeleteWorkspaceResponse {
    success: bool,
    workspace_id: String,
    delete_remote: bool,
    delete_branches: bool,
}

#[tool_router(router = workspaces_tools_router, vis = "pub")]
impl TaskServer {
    #[tool(description = "List local workspaces with optional filters and pagination.")]
    async fn list_workspaces(
        &self,
        Parameters(McpListWorkspacesRequest {
            archived,
            pinned,
            branch,
            name_search,
            limit,
            offset,
        }): Parameters<McpListWorkspacesRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url("/api/task-attempts");
        let mut workspaces: Vec<Workspace> = match self.send_json(self.client.get(&url)).await {
            Ok(ws) => ws,
            Err(e) => return Ok(e),
        };

        if let Some(archived_filter) = archived {
            workspaces.retain(|w| w.archived == archived_filter);
        }
        if let Some(pinned_filter) = pinned {
            workspaces.retain(|w| w.pinned == pinned_filter);
        }
        if let Some(branch_filter) = branch.as_deref() {
            workspaces.retain(|w| w.branch.eq_ignore_ascii_case(branch_filter));
        }
        if let Some(name_search) = name_search.as_deref() {
            let needle = name_search.to_ascii_lowercase();
            workspaces.retain(|w| {
                w.name
                    .as_deref()
                    .map(|name| name.to_ascii_lowercase().contains(&needle))
                    .unwrap_or(false)
            });
        }

        // Keep ordering deterministic after filtering.
        workspaces.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        let total_count = workspaces.len();
        let offset = offset.unwrap_or(0).max(0) as usize;
        let limit = limit.unwrap_or(50).max(0) as usize;

        let workspace_summaries = workspaces
            .into_iter()
            .skip(offset)
            .take(limit)
            .map(|workspace| WorkspaceSummary {
                id: workspace.id.to_string(),
                branch: workspace.branch,
                archived: workspace.archived,
                pinned: workspace.pinned,
                name: workspace.name,
                created_at: workspace.created_at.to_rfc3339(),
                updated_at: workspace.updated_at.to_rfc3339(),
            })
            .collect::<Vec<_>>();

        TaskServer::success(&McpListWorkspacesResponse {
            returned_count: workspace_summaries.len(),
            total_count,
            limit,
            offset,
            workspaces: workspace_summaries,
        })
    }

    #[tool(
        description = "Update a workspace's archived, pinned, or name fields. `workspace_id` is optional if running inside that workspace context."
    )]
    async fn update_workspace(
        &self,
        Parameters(McpUpdateWorkspaceRequest {
            workspace_id,
            archived,
            pinned,
            name,
        }): Parameters<McpUpdateWorkspaceRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let workspace_id = match workspace_id {
            Some(id) => id,
            None => match self.context.as_ref() {
                Some(ctx) => ctx.workspace_id,
                None => {
                    return Self::err(
                        "workspace_id is required (not available from workspace context)",
                        None::<&str>,
                    );
                }
            },
        };

        let url = self.url(&format!("/api/task-attempts/{}", workspace_id));
        let payload = UpdateWorkspace {
            archived,
            pinned,
            name,
        };

        let updated: Workspace = match self.send_json(self.client.put(&url).json(&payload)).await {
            Ok(ws) => ws,
            Err(e) => return Ok(e),
        };

        TaskServer::success(&McpUpdateWorkspaceResponse {
            success: true,
            workspace_id: updated.id.to_string(),
            archived: updated.archived,
            pinned: updated.pinned,
            name: updated.name,
        })
    }

    #[tool(
        description = "Delete a local workspace. `workspace_id` is optional if running inside that workspace context."
    )]
    async fn delete_workspace(
        &self,
        Parameters(McpDeleteWorkspaceRequest {
            workspace_id,
            delete_remote,
            delete_branches,
        }): Parameters<McpDeleteWorkspaceRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let workspace_id = match workspace_id {
            Some(id) => id,
            None => match self.context.as_ref() {
                Some(ctx) => ctx.workspace_id,
                None => {
                    return Self::err(
                        "workspace_id is required (not available from workspace context)",
                        None::<&str>,
                    );
                }
            },
        };

        let delete_remote = delete_remote.unwrap_or(false);
        let delete_branches = delete_branches.unwrap_or(false);

        let url = self.url(&format!("/api/task-attempts/{}", workspace_id));
        if let Err(e) = self
            .send_empty_json(self.client.delete(&url).query(&[
                ("delete_remote", delete_remote),
                ("delete_branches", delete_branches),
            ]))
            .await
        {
            return Ok(e);
        }

        TaskServer::success(&McpDeleteWorkspaceResponse {
            success: true,
            workspace_id: workspace_id.to_string(),
            delete_remote,
            delete_branches,
        })
    }
}
