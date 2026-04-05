# MCP Tools Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 10 new MCP tools (PR/git, execution, workspace, project tags, statuses) + 3 local server proxy routes + improve `update_issue` description, so external agents can ship work end-to-end.

**Architecture:** New MCP tools follow the existing pattern: request/response structs with `schemars::JsonSchema` + `#[tool]` macros, calling the local backend REST API via `self.send_json()` / `self.send_empty_json()`. Project tag mutations require new proxy routes in the local server since only list/get are currently proxied.

**Tech Stack:** Rust (rmcp crate, schemars, serde, reqwest, uuid), Mintlify MDX for docs.

---

### Task 1: Add tag proxy routes to local server

The local server proxies remote API calls at `/api/remote/...`. Tags currently only proxy `list` and `get`. Add `create`, `update`, and `delete` proxy routes following the exact pattern of `issue_tags.rs`.

**Files:**
- Modify: `crates/server/src/routes/remote/tags.rs`
- Modify: `crates/services/src/services/remote_client.rs`

- [ ] **Step 1: Add remote client methods for tag create/update/delete**

In `crates/services/src/services/remote_client.rs`, add these methods after the existing `get_tag` method (around line 868):

```rust
    /// Creates a tag in a project.
    pub async fn create_tag(
        &self,
        request: &CreateTagRequest,
    ) -> Result<MutationResponse<Tag>, RemoteClientError> {
        self.post_authed("/v1/tags", Some(request)).await
    }

    /// Updates a tag.
    pub async fn update_tag(
        &self,
        tag_id: Uuid,
        request: &UpdateTagRequest,
    ) -> Result<MutationResponse<Tag>, RemoteClientError> {
        self.patch_authed(&format!("/v1/tags/{tag_id}"), request)
            .await
    }

    /// Deletes a tag.
    pub async fn delete_tag(&self, tag_id: Uuid) -> Result<DeleteResponse, RemoteClientError> {
        let res = self
            .send(
                reqwest::Method::DELETE,
                &format!("/v1/tags/{tag_id}"),
                true,
                None::<&()>,
            )
            .await?;
        res.json::<DeleteResponse>()
            .await
            .map_err(|e| RemoteClientError::Serde(e.to_string()))
    }
```

Add `CreateTagRequest`, `UpdateTagRequest` to the imports from `api_types` at the top of `remote_client.rs` if not already present.

- [ ] **Step 2: Add proxy route handlers in tags.rs**

Replace `crates/server/src/routes/remote/tags.rs` with the expanded version:

```rust
use api_types::{
    CreateTagRequest, ListTagsResponse, MutationResponse, Tag, UpdateTagRequest,
};
use axum::{
    Router,
    extract::{Json, Path, Query, State},
    response::Json as ResponseJson,
    routing::get,
};
use serde::Deserialize;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub(super) struct ListTagsQuery {
    pub project_id: Uuid,
}

pub(super) fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/tags", get(list_tags).post(create_tag))
        .route(
            "/tags/{tag_id}",
            get(get_tag).put(update_tag).delete(delete_tag),
        )
}

async fn list_tags(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ListTagsQuery>,
) -> Result<ResponseJson<ApiResponse<ListTagsResponse>>, ApiError> {
    let client = deployment.remote_client()?;
    let response = client.list_tags(query.project_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn get_tag(
    State(deployment): State<DeploymentImpl>,
    Path(tag_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Tag>>, ApiError> {
    let client = deployment.remote_client()?;
    let response = client.get_tag(tag_id).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn create_tag(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateTagRequest>,
) -> Result<ResponseJson<ApiResponse<MutationResponse<Tag>>>, ApiError> {
    let client = deployment.remote_client()?;
    let response = client.create_tag(&request).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn update_tag(
    State(deployment): State<DeploymentImpl>,
    Path(tag_id): Path<Uuid>,
    Json(request): Json<UpdateTagRequest>,
) -> Result<ResponseJson<ApiResponse<MutationResponse<Tag>>>, ApiError> {
    let client = deployment.remote_client()?;
    let response = client.update_tag(tag_id, &request).await?;
    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn delete_tag(
    State(deployment): State<DeploymentImpl>,
    Path(tag_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let client = deployment.remote_client()?;
    client.delete_tag(tag_id).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo check -p server`
Expected: compiles cleanly

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/remote/tags.rs crates/services/src/services/remote_client.rs
git commit -m "feat: add tag create/update/delete proxy routes for MCP"
```

---

### Task 2: Add `git_status` and `git_push` MCP tools

**Files:**
- Create: `crates/mcp/src/task_server/tools/git.rs`
- Modify: `crates/mcp/src/task_server/tools/mod.rs` (add `mod git;`)

- [ ] **Step 1: Create git.rs with both tools**

Create `crates/mcp/src/task_server/tools/git.rs`:

```rust
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
    #[schemars(
        description = "Workspace ID. Optional if running inside that workspace context."
    )]
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
    #[schemars(
        description = "Workspace ID. Optional if running inside that workspace context."
    )]
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
        let statuses: Vec<RawRepoBranchStatus> =
            match self.send_json(self.client.get(&url)).await {
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
```

- [ ] **Step 2: Register the module in mod.rs**

In `crates/mcp/src/task_server/tools/mod.rs`, add after line `mod issue_tags;`:

```rust
mod git;
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo check -p mcp`
Expected: compiles cleanly (router not wired yet — that's Task 8)

- [ ] **Step 4: Commit**

```bash
git add crates/mcp/src/task_server/tools/git.rs crates/mcp/src/task_server/tools/mod.rs
git commit -m "feat: add git_status and git_push MCP tools"
```

---

### Task 3: Add `create_pull_request` MCP tool

**Files:**
- Create: `crates/mcp/src/task_server/tools/pull_requests.rs`
- Modify: `crates/mcp/src/task_server/tools/mod.rs` (add `mod pull_requests;`)

- [ ] **Step 1: Create pull_requests.rs**

Create `crates/mcp/src/task_server/tools/pull_requests.rs`:

```rust
use rmcp::{
    ErrorData, handler::server::wrapper::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::McpServer;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct CreatePullRequestRequest {
    #[schemars(
        description = "Workspace ID. Optional if running inside that workspace context."
    )]
    workspace_id: Option<Uuid>,
    #[schemars(description = "Repository ID to create the PR for. Use `list_repos` to find repo IDs.")]
    repo_id: Uuid,
    #[schemars(description = "Pull request title")]
    title: String,
    #[schemars(description = "Optional PR description body. Supports markdown.")]
    body: Option<String>,
    #[schemars(description = "Create as a draft PR (default: false)")]
    draft: Option<bool>,
    #[schemars(description = "Target branch to merge into. Defaults to the repo's default target branch.")]
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

        let url = self.url(&format!(
            "/api/workspaces/{}/pull-requests",
            workspace_id
        ));

        // The backend returns Result<String, PrError> where String is the PR URL.
        // On success, data is the URL string. On typed error, error_data has PrError.
        let pr_url: String = match self.send_json(self.client.post(&url).json(&payload)).await {
            Ok(url) => url,
            Err(e) => return Ok(Self::tool_error(e)),
        };

        Self::success(&CreatePullRequestResponse { pr_url })
    }
}
```

- [ ] **Step 2: Register the module in mod.rs**

In `crates/mcp/src/task_server/tools/mod.rs`, add after the `mod git;` line:

```rust
mod pull_requests;
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo check -p mcp`
Expected: compiles cleanly

- [ ] **Step 4: Commit**

```bash
git add crates/mcp/src/task_server/tools/pull_requests.rs crates/mcp/src/task_server/tools/mod.rs
git commit -m "feat: add create_pull_request MCP tool"
```

---

### Task 4: Add `stop_execution` MCP tool

**Files:**
- Modify: `crates/mcp/src/task_server/tools/sessions.rs`

- [ ] **Step 1: Add request/response structs and tool**

In `crates/mcp/src/task_server/tools/sessions.rs`, add the following structs after the existing `GetExecutionResponse` struct (around line 141):

```rust
#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct StopExecutionRequest {
    #[schemars(description = "The execution process ID to stop")]
    execution_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct StopExecutionResponse {
    success: bool,
    execution_id: String,
}
```

Then add the tool method inside the `#[tool_router(router = session_tools_router, vis = "pub")]` impl block, after the `get_execution` method:

```rust
    #[tool(
        description = "Stop a running execution process (coding agent, setup script, dev server, etc.). Use `get_execution` to check if a process is still running before stopping it."
    )]
    async fn stop_execution(
        &self,
        Parameters(StopExecutionRequest { execution_id }): Parameters<StopExecutionRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!(
            "/api/execution-processes/{}/stop",
            execution_id
        ));
        if let Err(e) = self.send_empty_json(self.client.post(&url)).await {
            return Ok(Self::tool_error(e));
        }

        Self::success(&StopExecutionResponse {
            success: true,
            execution_id: execution_id.to_string(),
        })
    }
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p mcp`
Expected: compiles cleanly

- [ ] **Step 3: Commit**

```bash
git add crates/mcp/src/task_server/tools/sessions.rs
git commit -m "feat: add stop_execution MCP tool"
```

---

### Task 5: Add `list_branches` MCP tool

**Files:**
- Modify: `crates/mcp/src/task_server/tools/repos.rs`

- [ ] **Step 1: Add request/response structs and tool**

In `crates/mcp/src/task_server/tools/repos.rs`, add after the existing `ListReposResponse` struct (around line 79):

```rust
#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ListBranchesRequest {
    #[schemars(description = "Repository ID. Use `list_repos` to find repo IDs.")]
    repo_id: Uuid,
}

#[derive(Debug, Deserialize)]
struct GitBranch {
    name: String,
    is_current: bool,
    is_remote: bool,
    last_commit_date: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct BranchSummary {
    #[schemars(description = "Branch name")]
    name: String,
    #[schemars(description = "Whether this is the currently checked-out branch")]
    is_current: bool,
    #[schemars(description = "Whether this is a remote-tracking branch")]
    is_remote: bool,
    #[schemars(description = "Last commit date on this branch")]
    last_commit_date: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct ListBranchesResponse {
    repo_id: String,
    branches: Vec<BranchSummary>,
    count: usize,
}
```

Then add the tool method inside the `#[tool_router(router = repos_tools_router, vis = "pub")]` impl block, after `list_repos`:

```rust
    #[tool(
        description = "List all branches for a repository, including whether each is the current branch, whether it's a remote-tracking branch, and the last commit date. Useful for choosing a branch when creating a workspace with `start_workspace`."
    )]
    async fn list_branches(
        &self,
        Parameters(ListBranchesRequest { repo_id }): Parameters<ListBranchesRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/repos/{}/branches", repo_id));
        let branches: Vec<GitBranch> = match self.send_json(self.client.get(&url)).await {
            Ok(b) => b,
            Err(e) => return Ok(Self::tool_error(e)),
        };

        let branch_summaries: Vec<BranchSummary> = branches
            .into_iter()
            .map(|b| BranchSummary {
                name: b.name,
                is_current: b.is_current,
                is_remote: b.is_remote,
                last_commit_date: b.last_commit_date,
            })
            .collect();

        McpServer::success(&ListBranchesResponse {
            repo_id: repo_id.to_string(),
            count: branch_summaries.len(),
            branches: branch_summaries,
        })
    }
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p mcp`
Expected: compiles cleanly

- [ ] **Step 3: Commit**

```bash
git add crates/mcp/src/task_server/tools/repos.rs
git commit -m "feat: add list_branches MCP tool"
```

---

### Task 6: Add `get_workspace` MCP tool

**Files:**
- Modify: `crates/mcp/src/task_server/tools/workspaces.rs`

- [ ] **Step 1: Add request/response structs and tool**

In `crates/mcp/src/task_server/tools/workspaces.rs`, add after the existing `McpDeleteWorkspaceResponse` struct (around line 97):

```rust
#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpGetWorkspaceRequest {
    #[schemars(
        description = "Workspace ID. Optional if running inside that workspace context."
    )]
    workspace_id: Option<Uuid>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct WorkspaceDetails {
    #[schemars(description = "Workspace ID")]
    id: String,
    #[schemars(description = "Workspace branch name")]
    branch: String,
    #[schemars(description = "Whether the workspace is archived")]
    archived: bool,
    #[schemars(description = "Whether the workspace is pinned")]
    pinned: bool,
    #[schemars(description = "Optional workspace display name")]
    name: Option<String>,
    #[schemars(description = "When setup completed, if applicable")]
    setup_completed_at: Option<String>,
    #[schemars(description = "Creation timestamp")]
    created_at: String,
    #[schemars(description = "Last update timestamp")]
    updated_at: String,
}
```

Then add the tool method inside the `#[tool_router(router = workspaces_tools_router, vis = "pub")]` impl block, after `list_workspaces`:

```rust
    #[tool(
        description = "Get detailed information about a single workspace including its branch name, archived/pinned state, and timestamps. `workspace_id` is optional if running inside that workspace context."
    )]
    async fn get_workspace(
        &self,
        Parameters(McpGetWorkspaceRequest { workspace_id }): Parameters<McpGetWorkspaceRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let workspace_id = match self.resolve_workspace_id(workspace_id) {
            Ok(id) => id,
            Err(e) => return Ok(Self::tool_error(e)),
        };
        if let Err(e) = self.scope_allows_workspace(workspace_id) {
            return Ok(Self::tool_error(e));
        }

        let url = self.url(&format!("/api/workspaces/{}", workspace_id));
        let workspace: Workspace = match self.send_json(self.client.get(&url)).await {
            Ok(ws) => ws,
            Err(e) => return Ok(Self::tool_error(e)),
        };

        Self::success(&WorkspaceDetails {
            id: workspace.id.to_string(),
            branch: workspace.branch,
            archived: workspace.archived,
            pinned: workspace.pinned,
            name: workspace.name,
            setup_completed_at: workspace.setup_completed_at.map(|t| t.to_rfc3339()),
            created_at: workspace.created_at.to_rfc3339(),
            updated_at: workspace.updated_at.to_rfc3339(),
        })
    }
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p mcp`
Expected: compiles cleanly

- [ ] **Step 3: Commit**

```bash
git add crates/mcp/src/task_server/tools/workspaces.rs
git commit -m "feat: add get_workspace MCP tool"
```

---

### Task 7: Add project tag MCP tools and `list_project_statuses`

**Files:**
- Modify: `crates/mcp/src/task_server/tools/issue_tags.rs`
- Modify: `crates/mcp/src/task_server/tools/remote_issues.rs`

- [ ] **Step 1: Add create_tag, update_tag, delete_tag to issue_tags.rs**

In `crates/mcp/src/task_server/tools/issue_tags.rs`, add the new imports at the top. Change the existing import line from:

```rust
use api_types::{
    CreateIssueTagRequest, IssueTag, ListIssueTagsResponse, ListTagsResponse, MutationResponse,
};
```

To:

```rust
use api_types::{
    CreateIssueTagRequest, CreateTagRequest, IssueTag, ListIssueTagsResponse, ListTagsResponse,
    MutationResponse, Tag, UpdateTagRequest,
};
```

Add the new request/response structs after `McpRemoveIssueTagResponse` (around line 86):

```rust
#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpCreateTagRequest {
    #[schemars(
        description = "Project ID. Optional if running inside a workspace linked to a remote project."
    )]
    project_id: Option<Uuid>,
    #[schemars(description = "Tag name (e.g. 'bug', 'feature', 'documentation')")]
    name: String,
    #[schemars(description = "Tag color as a hex string (e.g. '#ef4444')")]
    color: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpCreateTagResponse {
    tag: TagSummary,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpUpdateTagRequest {
    #[schemars(description = "The tag ID to update. Use `list_tags` to find tag IDs.")]
    tag_id: Uuid,
    #[schemars(description = "New tag name")]
    name: Option<String>,
    #[schemars(description = "New tag color as a hex string")]
    color: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpUpdateTagResponse {
    tag: TagSummary,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpDeleteTagRequest {
    #[schemars(description = "The tag ID to delete. Use `list_tags` to find tag IDs.")]
    tag_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpDeleteTagResponse {
    success: bool,
    tag_id: String,
}
```

Then add the tool methods inside the existing `#[tool_router(router = issue_tags_tools_router, vis = "pub")]` impl block, after `remove_issue_tag`:

```rust
    #[tool(
        description = "Create a new project tag for labeling issues (e.g. 'bug', 'feature', 'documentation'). Use `list_tags` to see existing tags. `project_id` is optional if running inside a workspace linked to a remote project."
    )]
    async fn create_tag(
        &self,
        Parameters(McpCreateTagRequest {
            project_id,
            name,
            color,
        }): Parameters<McpCreateTagRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let project_id = match self.resolve_project_id(project_id) {
            Ok(id) => id,
            Err(e) => return Ok(Self::tool_error(e)),
        };

        let payload = CreateTagRequest {
            id: None,
            project_id,
            name,
            color,
        };

        let url = self.url("/api/remote/tags");
        let response: MutationResponse<Tag> =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(r) => r,
                Err(e) => return Ok(Self::tool_error(e)),
            };

        Self::success(&McpCreateTagResponse {
            tag: TagSummary {
                id: response.data.id.to_string(),
                project_id: response.data.project_id.to_string(),
                name: response.data.name,
                color: response.data.color,
            },
        })
    }

    #[tool(description = "Update a project tag's name or color. Use `list_tags` to find tag IDs.")]
    async fn update_tag(
        &self,
        Parameters(McpUpdateTagRequest {
            tag_id,
            name,
            color,
        }): Parameters<McpUpdateTagRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let payload = UpdateTagRequest { name, color };

        let url = self.url(&format!("/api/remote/tags/{}", tag_id));
        let response: MutationResponse<Tag> =
            match self.send_json(self.client.put(&url).json(&payload)).await {
                Ok(r) => r,
                Err(e) => return Ok(Self::tool_error(e)),
            };

        Self::success(&McpUpdateTagResponse {
            tag: TagSummary {
                id: response.data.id.to_string(),
                project_id: response.data.project_id.to_string(),
                name: response.data.name,
                color: response.data.color,
            },
        })
    }

    #[tool(
        description = "Delete a project tag. This removes the tag definition — it will no longer appear on any issues. Use `list_tags` to find tag IDs."
    )]
    async fn delete_tag(
        &self,
        Parameters(McpDeleteTagRequest { tag_id }): Parameters<McpDeleteTagRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/remote/tags/{}", tag_id));
        if let Err(e) = self.send_empty_json(self.client.delete(&url)).await {
            return Ok(Self::tool_error(e));
        }

        Self::success(&McpDeleteTagResponse {
            success: true,
            tag_id: tag_id.to_string(),
        })
    }
```

- [ ] **Step 2: Add list_project_statuses to remote_issues.rs**

In `crates/mcp/src/task_server/tools/remote_issues.rs`, add request/response structs after `McpListIssuePrioritiesResponse` (around line 251):

```rust
#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpListProjectStatusesRequest {
    #[schemars(
        description = "Project ID. Optional if running inside a workspace linked to a remote project."
    )]
    project_id: Option<Uuid>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct ProjectStatusSummary {
    #[schemars(description = "Status ID")]
    id: String,
    #[schemars(description = "Status name (e.g. 'Backlog', 'In Progress', 'Done')")]
    name: String,
    #[schemars(description = "Status color")]
    color: String,
    #[schemars(description = "Display order")]
    sort_order: i32,
    #[schemars(description = "Whether this status is hidden from the board")]
    hidden: bool,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpListProjectStatusesResponse {
    project_id: String,
    statuses: Vec<ProjectStatusSummary>,
    count: usize,
}
```

Then add the tool method inside the `#[tool_router(router = remote_issues_tools_router, vis = "pub")]` impl block, after `list_issue_priorities`:

```rust
    #[tool(
        description = "List all available statuses for a project (e.g. 'Backlog', 'Todo', 'In Progress', 'Done'). Use this to discover valid status names before calling `update_issue` with a status change. `project_id` is optional if running inside a workspace linked to a remote project."
    )]
    async fn list_project_statuses(
        &self,
        Parameters(McpListProjectStatusesRequest { project_id }): Parameters<
            McpListProjectStatusesRequest,
        >,
    ) -> Result<CallToolResult, ErrorData> {
        let project_id = match self.resolve_project_id(project_id) {
            Ok(id) => id,
            Err(e) => return Ok(Self::tool_error(e)),
        };

        let statuses = match self.fetch_project_statuses(project_id).await {
            Ok(s) => s,
            Err(e) => return Ok(Self::tool_error(e)),
        };

        let status_summaries: Vec<ProjectStatusSummary> = statuses
            .into_iter()
            .map(|s| ProjectStatusSummary {
                id: s.id.to_string(),
                name: s.name,
                color: s.color,
                sort_order: s.sort_order,
                hidden: s.hidden,
            })
            .collect();

        Self::success(&McpListProjectStatusesResponse {
            project_id: project_id.to_string(),
            count: status_summaries.len(),
            statuses: status_summaries,
        })
    }
```

- [ ] **Step 3: Improve update_issue description**

In `crates/mcp/src/task_server/tools/remote_issues.rs`, find the `update_issue` tool description (around line 483-484) and change from:

```rust
    #[tool(
        description = "Update an existing issue's title, description, or status. `issue_id` is required. `title`, `description`, and `status` are optional."
    )]
```

To:

```rust
    #[tool(
        description = "Update an existing issue's title, description, status, or priority. `issue_id` is required; all other fields are optional. To change status, pass the status name as a string (e.g. 'In Progress', 'Done') — use `list_project_statuses` to discover valid names for the project. To change priority, pass one of: 'urgent', 'high', 'medium', 'low'."
    )]
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check -p mcp`
Expected: compiles cleanly

- [ ] **Step 5: Commit**

```bash
git add crates/mcp/src/task_server/tools/issue_tags.rs crates/mcp/src/task_server/tools/remote_issues.rs
git commit -m "feat: add project tag CRUD, list_project_statuses, improve update_issue description"
```

---

### Task 8: Wire up tool routers and update tests

**Files:**
- Modify: `crates/mcp/src/task_server/tools/mod.rs`

- [ ] **Step 1: Add new routers to global_mode_router**

In `crates/mcp/src/task_server/tools/mod.rs`, update the `global_mode_router` function to add the new routers:

```rust
    pub fn global_mode_router() -> rmcp::handler::server::tool::ToolRouter<Self> {
        Self::context_tools_router()
            + Self::workspaces_tools_router()
            + Self::organizations_tools_router()
            + Self::repos_tools_router()
            + Self::remote_projects_tools_router()
            + Self::remote_issues_tools_router()
            + Self::issue_assignees_tools_router()
            + Self::issue_tags_tools_router()
            + Self::issue_relationships_tools_router()
            + Self::task_attempts_tools_router()
            + Self::session_tools_router()
            + Self::git_tools_router()
            + Self::pull_requests_tools_router()
    }
```

- [ ] **Step 2: Add tools to orchestrator_mode_router**

Update the `orchestrator_mode_router` function to include git, PR, and workspace tools that agents in scoped sessions need:

```rust
    pub fn orchestrator_mode_router() -> rmcp::handler::server::tool::ToolRouter<Self> {
        let mut router = Self::context_tools_router()
            + Self::workspaces_tools_router()
            + Self::session_tools_router()
            + Self::git_tools_router()
            + Self::pull_requests_tools_router();
        router.remove_route("list_workspaces");
        router.remove_route("delete_workspace");
        router
    }
```

- [ ] **Step 3: Update the orchestrator mode test**

In the same file, update the `orchestrator_mode_exposes_only_scoped_workflow_tools` test to include the new tools:

```rust
    #[test]
    fn orchestrator_mode_exposes_only_scoped_workflow_tools() {
        let actual = tool_names(McpServer::orchestrator_mode_router());
        let expected = BTreeSet::from([
            "create_pull_request".to_string(),
            "create_session".to_string(),
            "get_context".to_string(),
            "get_execution".to_string(),
            "get_workspace".to_string(),
            "git_push".to_string(),
            "git_status".to_string(),
            "list_sessions".to_string(),
            "run_session_prompt".to_string(),
            "stop_execution".to_string(),
            "update_session".to_string(),
            "update_workspace".to_string(),
        ]);

        assert_eq!(actual, expected);
    }
```

- [ ] **Step 4: Run all tests**

Run: `cargo test -p mcp`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add crates/mcp/src/task_server/tools/mod.rs
git commit -m "feat: wire new MCP tool routers and update orchestrator mode tests"
```

---

### Task 9: Update Mintlify documentation

**Files:**
- Modify: `docs/integrations/vibe-kanban-mcp-server.mdx`

- [ ] **Step 1: Add new sections to the docs**

In `docs/integrations/vibe-kanban-mcp-server.mdx`, add the following new sections. Insert **Git & Pull Requests** after the "Workspace Sessions" section (after line 156), and **Project Statuses** after "Issue Management":

After the "Issue Management" table (after line 91, before the Tip), add a new row to the issue management table or add a new "Project Statuses" section:

```mdx
### Project Statuses

| Tool | Purpose | Required Parameters | Optional Parameters | Returns |
|------|---------|-------------------|-------------------|---------|
| `list_project_statuses` | List available statuses for a project (e.g. Backlog, In Progress, Done) | None | `project_id` | List of statuses with IDs, names, colours, and sort order |

<Tip>
Use `list_project_statuses` to discover valid status names before calling `update_issue` with a status change. Status names are case-insensitive.
</Tip>
```

Update the existing `update_issue` row description in the Issue Management table (line 89) from:

```
| `update_issue` | Update an existing issue | `issue_id` | `title`<br/>`description`<br/>`status`<br/>`priority`<br/>`parent_issue_id` | Updated issue details |
```

To:

```
| `update_issue` | Update an existing issue's title, description, status, or priority. To change status, pass the name (e.g. 'In Progress') — use `list_project_statuses` to find valid names | `issue_id` | `title`<br/>`description`<br/>`status`<br/>`priority`<br/>`parent_issue_id` | Updated issue details |
```

Add to the Issue Tags section table (after line 112):

```
| `create_tag` | Create a new project tag for labelling issues | `name`<br/>`color` | `project_id` | Created tag with ID, name, and colour |
| `update_tag` | Update a project tag's name or colour | `tag_id` | `name`<br/>`color` | Updated tag details |
| `delete_tag` | Delete a project tag definition | `tag_id` | None | Deletion confirmation |
```

Add a new **Repository Branches** row to the Repository Management table (after line 131):

```
| `list_branches` | List all branches for a repository | `repo_id` | None | List of branches with name, current/remote flags, and last commit date |
```

Add a new **Git & Pull Requests** section after "Workspace Management" (after line 141):

```mdx
### Git & Pull Requests

| Tool | Purpose | Required Parameters | Optional Parameters | Returns |
|------|---------|-------------------|-------------------|---------|
| `git_status` | Get branch status for all repos in a workspace | None | `workspace_id` | Per-repo ahead/behind counts, uncommitted changes, conflict info |
| `git_push` | Push a workspace branch to its remote | `repo_id` | `workspace_id` | Push confirmation or force-push-required error |
| `create_pull_request` | Create a PR from a workspace branch (auto-pushes first) | `repo_id`<br/>`title` | `workspace_id`<br/>`body`<br/>`draft`<br/>`target_branch` | PR URL |

<Tip>
Use `git_status` before `create_pull_request` to verify there are no uncommitted changes. The PR creation endpoint automatically pushes the branch before opening the PR.
</Tip>
```

Add a new **Execution Control** row to the Workspace Sessions table (after line 150):

```
| `stop_execution` | Stop a running execution process | `execution_id` | None | Stop confirmation |
```

Add `get_workspace` to the Workspace Management table (after line 139):

```
| `get_workspace` | Get detailed information about a workspace | None | `workspace_id` | Workspace details including branch, archived/pinned state, timestamps |
```

- [ ] **Step 2: Verify docs build**

Run: `cd docs && npx mintlify dev --port 3333` (check it renders, then Ctrl+C)
Or if no local docs preview is set up, just visually verify the MDX is valid.

- [ ] **Step 3: Commit**

```bash
git add docs/integrations/vibe-kanban-mcp-server.mdx
git commit -m "docs: add new MCP tools to Mintlify documentation"
```

---

### Task 10: Final verification

- [ ] **Step 1: Format all code**

Run: `pnpm run format`

- [ ] **Step 2: Run full check**

Run: `pnpm run backend:check`
Expected: all workspaces compile cleanly

- [ ] **Step 3: Run all tests**

Run: `cargo test --workspace`
Expected: all tests pass

- [ ] **Step 4: Final commit if formatting changed anything**

```bash
git add -A
git commit -m "chore: format code after MCP tools expansion"
```
