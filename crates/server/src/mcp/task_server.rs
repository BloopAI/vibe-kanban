use std::str::FromStr;

use api_types::{
    Issue, ListIssuesResponse, ListOrganizationsResponse, ListProjectStatusesResponse,
    MutationResponse, ProjectStatus,
};
use db::models::{
    project::Project,
    repo::Repo,
    tag::Tag,
    task::{CreateTask, TaskWithAttemptStatus},
    workspace::{Workspace, WorkspaceContext},
};
use executors::{executors::BaseCodingAgent, profile::ExecutorProfileId};
use regex::Regex;
use rmcp::{
    ErrorData, ServerHandler,
    handler::server::tool::{Parameters, ToolRouter},
    model::{
        CallToolResult, Content, Implementation, ProtocolVersion, ServerCapabilities, ServerInfo,
    },
    schemars, tool, tool_handler, tool_router,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json;
use uuid::Uuid;

use crate::routes::{
    containers::ContainerQuery, task_attempts::WorkspaceRepoInput, tasks::CreateAndStartTaskRequest,
};

// ── MCP request/response types ──────────────────────────────────────────────

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct McpCreateIssueRequest {
    #[schemars(
        description = "The ID of the project to create the issue in. Optional if running inside a workspace linked to a remote project."
    )]
    pub project_id: Option<Uuid>,
    #[schemars(description = "The title of the issue")]
    pub title: String,
    #[schemars(description = "Optional description of the issue")]
    pub description: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct McpCreateIssueResponse {
    pub issue_id: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ProjectSummary {
    #[schemars(description = "The unique identifier of the project")]
    pub id: String,
    #[schemars(description = "The name of the project")]
    pub name: String,
    #[schemars(description = "When the project was created")]
    pub created_at: String,
    #[schemars(description = "When the project was last updated")]
    pub updated_at: String,
}

impl ProjectSummary {
    fn from_remote_project(project: api_types::Project) -> Self {
        Self {
            id: project.id.to_string(),
            name: project.name,
            created_at: project.created_at.to_rfc3339(),
            updated_at: project.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct McpRepoSummary {
    #[schemars(description = "The unique identifier of the repository")]
    pub id: String,
    #[schemars(description = "The name of the repository")]
    pub name: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListReposRequest {}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetRepoRequest {
    #[schemars(description = "The ID of the repository to retrieve")]
    pub repo_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct RepoDetails {
    #[schemars(description = "The unique identifier of the repository")]
    pub id: String,
    #[schemars(description = "The name of the repository")]
    pub name: String,
    #[schemars(description = "The display name of the repository")]
    pub display_name: String,
    #[schemars(description = "The setup script that runs when initializing a workspace")]
    pub setup_script: Option<String>,
    #[schemars(description = "The cleanup script that runs when tearing down a workspace")]
    pub cleanup_script: Option<String>,
    #[schemars(description = "The dev server script that starts the development server")]
    pub dev_server_script: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateSetupScriptRequest {
    #[schemars(description = "The ID of the repository to update")]
    pub repo_id: Uuid,
    #[schemars(description = "The new setup script content (use empty string to clear)")]
    pub script: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateCleanupScriptRequest {
    #[schemars(description = "The ID of the repository to update")]
    pub repo_id: Uuid,
    #[schemars(description = "The new cleanup script content (use empty string to clear)")]
    pub script: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateDevServerScriptRequest {
    #[schemars(description = "The ID of the repository to update")]
    pub repo_id: Uuid,
    #[schemars(description = "The new dev server script content (use empty string to clear)")]
    pub script: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct UpdateRepoScriptResponse {
    #[schemars(description = "Whether the update was successful")]
    pub success: bool,
    #[schemars(description = "The repository ID that was updated")]
    pub repo_id: String,
    #[schemars(description = "The script field that was updated")]
    pub field: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ListReposResponse {
    pub repos: Vec<McpRepoSummary>,
    pub count: usize,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct McpListProjectsRequest {
    #[schemars(description = "The ID of the organization to list projects from")]
    pub organization_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct McpListProjectsResponse {
    pub projects: Vec<ProjectSummary>,
    pub count: usize,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct OrganizationSummary {
    #[schemars(description = "The unique identifier of the organization")]
    pub id: String,
    #[schemars(description = "The name of the organization")]
    pub name: String,
    #[schemars(description = "The slug of the organization")]
    pub slug: String,
    #[schemars(description = "Whether this is a personal organization")]
    pub is_personal: bool,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct McpListOrganizationsResponse {
    pub organizations: Vec<OrganizationSummary>,
    pub count: usize,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct McpListIssuesRequest {
    #[schemars(
        description = "The ID of the project to list issues from. Optional if running inside a workspace linked to a remote project."
    )]
    pub project_id: Option<Uuid>,
    #[schemars(description = "Maximum number of issues to return (default: 50)")]
    pub limit: Option<i32>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct IssueSummary {
    #[schemars(description = "The unique identifier of the issue")]
    pub id: String,
    #[schemars(description = "The title of the issue")]
    pub title: String,
    #[schemars(description = "Current status of the issue")]
    pub status: String,
    #[schemars(description = "When the issue was created")]
    pub created_at: String,
    #[schemars(description = "When the issue was last updated")]
    pub updated_at: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct IssueDetails {
    #[schemars(description = "The unique identifier of the issue")]
    pub id: String,
    #[schemars(description = "The title of the issue")]
    pub title: String,
    #[schemars(description = "Optional description of the issue")]
    pub description: Option<String>,
    #[schemars(description = "Current status of the issue")]
    pub status: String,
    #[schemars(description = "The status ID (UUID)")]
    pub status_id: String,
    #[schemars(description = "When the issue was created")]
    pub created_at: String,
    #[schemars(description = "When the issue was last updated")]
    pub updated_at: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct McpListIssuesResponse {
    pub issues: Vec<IssueSummary>,
    pub count: usize,
    pub project_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct McpUpdateIssueRequest {
    #[schemars(description = "The ID of the issue to update")]
    pub issue_id: Uuid,
    #[schemars(description = "New title for the issue")]
    pub title: Option<String>,
    #[schemars(description = "New description for the issue")]
    pub description: Option<String>,
    #[schemars(description = "New status name for the issue (must match a project status name)")]
    pub status: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct McpUpdateIssueResponse {
    pub issue: IssueDetails,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct McpDeleteIssueRequest {
    #[schemars(description = "The ID of the issue to delete")]
    pub issue_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct McpDeleteIssueResponse {
    pub deleted_issue_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct McpGetIssueRequest {
    #[schemars(description = "The ID of the issue to retrieve")]
    pub issue_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct McpGetIssueResponse {
    pub issue: IssueDetails,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct McpWorkspaceRepoInput {
    #[schemars(description = "The repository ID")]
    pub repo_id: Uuid,
    #[schemars(description = "The base branch for this repository")]
    pub base_branch: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct StartWorkspaceSessionRequest {
    #[schemars(description = "A title for the workspace (used as the task name)")]
    pub title: String,
    #[schemars(
        description = "The coding agent executor to run ('CLAUDE_CODE', 'AMP', 'GEMINI', 'CODEX', 'OPENCODE', 'CURSOR_AGENT', 'QWEN_CODE', 'COPILOT', 'DROID')"
    )]
    pub executor: String,
    #[schemars(description = "Optional executor variant, if needed")]
    pub variant: Option<String>,
    #[schemars(description = "Base branch for each repository in the project")]
    pub repos: Vec<McpWorkspaceRepoInput>,
    #[schemars(
        description = "Optional issue ID to link the workspace to. When provided, the workspace will be associated with this remote issue."
    )]
    pub issue_id: Option<Uuid>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct StartWorkspaceSessionResponse {
    pub workspace_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct McpLinkWorkspaceRequest {
    #[schemars(description = "The workspace ID to link")]
    pub workspace_id: Uuid,
    #[schemars(description = "The issue ID to link the workspace to")]
    pub issue_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct McpLinkWorkspaceResponse {
    #[schemars(description = "Whether the linking was successful")]
    pub success: bool,
    #[schemars(description = "The workspace ID that was linked")]
    pub workspace_id: String,
    #[schemars(description = "The issue ID it was linked to")]
    pub issue_id: String,
}

// ── Server struct ───────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct TaskServer {
    client: reqwest::Client,
    base_url: String,
    tool_router: ToolRouter<TaskServer>,
    context: Option<McpContext>,
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

impl TaskServer {
    pub fn new(base_url: &str) -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url: base_url.to_string(),
            tool_router: Self::tool_router(),
            context: None,
        }
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

// ── Helpers ─────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ApiResponseEnvelope<T> {
    success: bool,
    data: Option<T>,
    message: Option<String>,
}

impl TaskServer {
    fn success<T: Serialize>(data: &T) -> Result<CallToolResult, ErrorData> {
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(data)
                .unwrap_or_else(|_| "Failed to serialize response".to_string()),
        )]))
    }

    fn err_value(v: serde_json::Value) -> Result<CallToolResult, ErrorData> {
        Ok(CallToolResult::error(vec![Content::text(
            serde_json::to_string_pretty(&v)
                .unwrap_or_else(|_| "Failed to serialize error".to_string()),
        )]))
    }

    fn err<S: Into<String>>(msg: S, details: Option<S>) -> Result<CallToolResult, ErrorData> {
        let mut v = serde_json::json!({"success": false, "error": msg.into()});
        if let Some(d) = details {
            v["details"] = serde_json::json!(d.into());
        };
        Self::err_value(v)
    }

    async fn send_json<T: DeserializeOwned>(
        &self,
        rb: reqwest::RequestBuilder,
    ) -> Result<T, CallToolResult> {
        let resp = rb
            .send()
            .await
            .map_err(|e| Self::err("Failed to connect to VK API", Some(&e.to_string())).unwrap())?;

        if !resp.status().is_success() {
            let status = resp.status();
            return Err(
                Self::err(format!("VK API returned error status: {}", status), None).unwrap(),
            );
        }

        let api_response = resp.json::<ApiResponseEnvelope<T>>().await.map_err(|e| {
            Self::err("Failed to parse VK API response", Some(&e.to_string())).unwrap()
        })?;

        if !api_response.success {
            let msg = api_response.message.as_deref().unwrap_or("Unknown error");
            return Err(Self::err("VK API returned error", Some(msg)).unwrap());
        }

        api_response
            .data
            .ok_or_else(|| Self::err("VK API response missing data field", None).unwrap())
    }

    async fn send_empty_json(&self, rb: reqwest::RequestBuilder) -> Result<(), CallToolResult> {
        let resp = rb
            .send()
            .await
            .map_err(|e| Self::err("Failed to connect to VK API", Some(&e.to_string())).unwrap())?;

        if !resp.status().is_success() {
            let status = resp.status();
            return Err(
                Self::err(format!("VK API returned error status: {}", status), None).unwrap(),
            );
        }

        #[derive(Deserialize)]
        struct EmptyApiResponse {
            success: bool,
            message: Option<String>,
        }

        let api_response = resp.json::<EmptyApiResponse>().await.map_err(|e| {
            Self::err("Failed to parse VK API response", Some(&e.to_string())).unwrap()
        })?;

        if !api_response.success {
            let msg = api_response.message.as_deref().unwrap_or("Unknown error");
            return Err(Self::err("VK API returned error", Some(msg)).unwrap());
        }

        Ok(())
    }

    fn url(&self, path: &str) -> String {
        format!(
            "{}/{}",
            self.base_url.trim_end_matches('/'),
            path.trim_start_matches('/')
        )
    }

    /// Expands @tagname references in text by replacing them with tag content.
    async fn expand_tags(&self, text: &str) -> String {
        let tag_pattern = match Regex::new(r"@([^\s@]+)") {
            Ok(re) => re,
            Err(_) => return text.to_string(),
        };

        let tag_names: Vec<String> = tag_pattern
            .captures_iter(text)
            .filter_map(|cap| cap.get(1).map(|m| m.as_str().to_string()))
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();

        if tag_names.is_empty() {
            return text.to_string();
        }

        let url = self.url("/api/tags");
        let tags: Vec<Tag> = match self.client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                match resp.json::<ApiResponseEnvelope<Vec<Tag>>>().await {
                    Ok(envelope) if envelope.success => envelope.data.unwrap_or_default(),
                    _ => return text.to_string(),
                }
            }
            _ => return text.to_string(),
        };

        let tag_map: std::collections::HashMap<&str, &str> = tags
            .iter()
            .map(|t| (t.tag_name.as_str(), t.content.as_str()))
            .collect();

        let result = tag_pattern.replace_all(text, |caps: &regex::Captures| {
            let tag_name = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            match tag_map.get(tag_name) {
                Some(content) => (*content).to_string(),
                None => caps.get(0).map(|m| m.as_str()).unwrap_or("").to_string(),
            }
        });

        result.into_owned()
    }

    /// Resolves a project_id from an explicit parameter or falls back to context.
    fn resolve_project_id(&self, explicit: Option<Uuid>) -> Result<Uuid, CallToolResult> {
        if let Some(id) = explicit {
            return Ok(id);
        }
        if let Some(ctx) = &self.context
            && let Some(id) = ctx.project_id
        {
            return Ok(id);
        }
        Err(Self::err(
            "project_id is required (not available from workspace context)",
            None::<&str>,
        )
        .unwrap())
    }

    /// Fetches project statuses for a project, returning a map of status name → status.
    async fn fetch_project_statuses(
        &self,
        project_id: Uuid,
    ) -> Result<Vec<ProjectStatus>, CallToolResult> {
        let url = self.url(&format!(
            "/api/remote/project-statuses?project_id={}",
            project_id
        ));
        let response: ListProjectStatusesResponse = self.send_json(self.client.get(&url)).await?;
        Ok(response.project_statuses)
    }

    /// Resolves a status name to a status_id UUID using project statuses.
    async fn resolve_status_id(
        &self,
        project_id: Uuid,
        status_name: &str,
    ) -> Result<Uuid, CallToolResult> {
        let statuses = self.fetch_project_statuses(project_id).await?;
        statuses
            .iter()
            .find(|s| s.name.eq_ignore_ascii_case(status_name))
            .map(|s| s.id)
            .ok_or_else(|| {
                let available: Vec<&str> = statuses.iter().map(|s| s.name.as_str()).collect();
                Self::err(
                    format!(
                        "Unknown status '{}'. Available statuses: {:?}",
                        status_name, available
                    ),
                    None::<String>,
                )
                .unwrap()
            })
    }

    /// Gets the default status_id for a project (first non-hidden status by sort_order).
    async fn default_status_id(&self, project_id: Uuid) -> Result<Uuid, CallToolResult> {
        let statuses = self.fetch_project_statuses(project_id).await?;
        statuses
            .iter()
            .filter(|s| !s.hidden)
            .min_by_key(|s| s.sort_order)
            .map(|s| s.id)
            .ok_or_else(|| {
                Self::err("No visible statuses found for project", None::<&str>).unwrap()
            })
    }

    /// Resolves a status_id to its display name. Falls back to UUID string if lookup fails.
    async fn resolve_status_name(&self, project_id: Uuid, status_id: Uuid) -> String {
        match self.fetch_project_statuses(project_id).await {
            Ok(statuses) => statuses
                .iter()
                .find(|s| s.id == status_id)
                .map(|s| s.name.clone())
                .unwrap_or_else(|| status_id.to_string()),
            Err(_) => status_id.to_string(),
        }
    }

    /// Converts an Issue to IssueSummary using a pre-fetched status map when available.
    fn issue_to_summary(
        &self,
        issue: &Issue,
        status_names_by_id: Option<&std::collections::HashMap<Uuid, String>>,
    ) -> IssueSummary {
        let status = status_names_by_id
            .and_then(|status_map| status_map.get(&issue.status_id).cloned())
            .unwrap_or_else(|| issue.status_id.to_string());
        IssueSummary {
            id: issue.id.to_string(),
            title: issue.title.clone(),
            status,
            created_at: issue.created_at.to_rfc3339(),
            updated_at: issue.updated_at.to_rfc3339(),
        }
    }

    /// Links a workspace to a remote issue by fetching the issue's project_id
    /// and calling the link endpoint.
    async fn link_workspace_to_issue(
        &self,
        workspace_id: Uuid,
        issue_id: Uuid,
    ) -> Result<(), CallToolResult> {
        let issue_url = self.url(&format!("/api/remote/issues/{}", issue_id));
        let issue: Issue = self.send_json(self.client.get(&issue_url)).await?;

        let link_url = self.url(&format!("/api/task-attempts/{}/link", workspace_id));
        let link_payload = serde_json::json!({
            "project_id": issue.project_id,
            "issue_id": issue_id,
        });
        self.send_empty_json(self.client.post(&link_url).json(&link_payload))
            .await
    }

    /// Converts an Issue to IssueDetails, resolving status_id to name.
    async fn issue_to_details(&self, issue: &Issue) -> IssueDetails {
        let status = self
            .resolve_status_name(issue.project_id, issue.status_id)
            .await;
        IssueDetails {
            id: issue.id.to_string(),
            title: issue.title.clone(),
            description: issue.description.clone(),
            status,
            status_id: issue.status_id.to_string(),
            created_at: issue.created_at.to_rfc3339(),
            updated_at: issue.updated_at.to_rfc3339(),
        }
    }
}

// ── MCP Tools ───────────────────────────────────────────────────────────────

#[tool_router]
impl TaskServer {
    #[tool(
        description = "Return project, issue, and workspace metadata for the current workspace session context."
    )]
    async fn get_context(&self) -> Result<CallToolResult, ErrorData> {
        let context = self.context.as_ref().expect("VK context should exist");
        TaskServer::success(context)
    }

    #[tool(
        description = "Create a new issue in a project. `project_id` is optional if running inside a workspace linked to a remote project."
    )]
    async fn create_issue(
        &self,
        Parameters(McpCreateIssueRequest {
            project_id,
            title,
            description,
        }): Parameters<McpCreateIssueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let project_id = match self.resolve_project_id(project_id) {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let expanded_description = match description {
            Some(desc) => Some(self.expand_tags(&desc).await),
            None => None,
        };

        let status_id = match self.default_status_id(project_id).await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let payload = api_types::CreateIssueRequest {
            id: None,
            project_id,
            status_id,
            title,
            description: expanded_description,
            priority: None,
            start_date: None,
            target_date: None,
            completed_at: None,
            sort_order: 0.0,
            parent_issue_id: None,
            parent_issue_sort_order: None,
            extension_metadata: serde_json::json!({}),
        };

        let url = self.url("/api/remote/issues");
        let response: MutationResponse<Issue> =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(r) => r,
                Err(e) => return Ok(e),
            };

        TaskServer::success(&McpCreateIssueResponse {
            issue_id: response.data.id.to_string(),
        })
    }

    #[tool(description = "List all the available projects")]
    async fn list_projects(
        &self,
        Parameters(McpListProjectsRequest { organization_id }): Parameters<McpListProjectsRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!(
            "/api/remote/projects?organization_id={}",
            organization_id
        ));
        let response: api_types::ListProjectsResponse =
            match self.send_json(self.client.get(&url)).await {
                Ok(r) => r,
                Err(e) => return Ok(e),
            };

        let project_summaries: Vec<ProjectSummary> = response
            .projects
            .into_iter()
            .map(ProjectSummary::from_remote_project)
            .collect();

        TaskServer::success(&McpListProjectsResponse {
            count: project_summaries.len(),
            projects: project_summaries,
        })
    }

    #[tool(description = "List all the available organizations")]
    async fn list_organizations(&self) -> Result<CallToolResult, ErrorData> {
        let url = self.url("/api/organizations");
        let response: ListOrganizationsResponse = match self.send_json(self.client.get(&url)).await
        {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };

        let org_summaries: Vec<OrganizationSummary> = response
            .organizations
            .into_iter()
            .map(|o| OrganizationSummary {
                id: o.id.to_string(),
                name: o.name,
                slug: o.slug,
                is_personal: o.is_personal,
            })
            .collect();

        TaskServer::success(&McpListOrganizationsResponse {
            count: org_summaries.len(),
            organizations: org_summaries,
        })
    }

    #[tool(description = "List all repositories.")]
    async fn list_repos(
        &self,
        Parameters(_): Parameters<ListReposRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url("/api/repos");
        let repos: Vec<Repo> = match self.send_json(self.client.get(&url)).await {
            Ok(rs) => rs,
            Err(e) => return Ok(e),
        };

        let repo_summaries: Vec<McpRepoSummary> = repos
            .into_iter()
            .map(|r| McpRepoSummary {
                id: r.id.to_string(),
                name: r.name,
            })
            .collect();

        let response = ListReposResponse {
            count: repo_summaries.len(),
            repos: repo_summaries,
        };

        TaskServer::success(&response)
    }

    #[tool(
        description = "Get detailed information about a repository including its scripts. Use `list_repos` to find available repo IDs."
    )]
    async fn get_repo(
        &self,
        Parameters(GetRepoRequest { repo_id }): Parameters<GetRepoRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/repos/{}", repo_id));
        let repo: Repo = match self.send_json(self.client.get(&url)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };
        TaskServer::success(&RepoDetails {
            id: repo.id.to_string(),
            name: repo.name,
            display_name: repo.display_name,
            setup_script: repo.setup_script,
            cleanup_script: repo.cleanup_script,
            dev_server_script: repo.dev_server_script,
        })
    }

    #[tool(
        description = "Update a repository's setup script. The setup script runs when initializing a workspace."
    )]
    async fn update_setup_script(
        &self,
        Parameters(UpdateSetupScriptRequest { repo_id, script }): Parameters<
            UpdateSetupScriptRequest,
        >,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/repos/{}", repo_id));
        let script_value = if script.is_empty() {
            None
        } else {
            Some(script)
        };
        let payload = serde_json::json!({
            "setup_script": script_value
        });
        let _repo: Repo = match self.send_json(self.client.put(&url).json(&payload)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };
        TaskServer::success(&UpdateRepoScriptResponse {
            success: true,
            repo_id: repo_id.to_string(),
            field: "setup_script".to_string(),
        })
    }

    #[tool(
        description = "Update a repository's cleanup script. The cleanup script runs when tearing down a workspace."
    )]
    async fn update_cleanup_script(
        &self,
        Parameters(UpdateCleanupScriptRequest { repo_id, script }): Parameters<
            UpdateCleanupScriptRequest,
        >,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/repos/{}", repo_id));
        let script_value = if script.is_empty() {
            None
        } else {
            Some(script)
        };
        let payload = serde_json::json!({
            "cleanup_script": script_value
        });
        let _repo: Repo = match self.send_json(self.client.put(&url).json(&payload)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };
        TaskServer::success(&UpdateRepoScriptResponse {
            success: true,
            repo_id: repo_id.to_string(),
            field: "cleanup_script".to_string(),
        })
    }

    #[tool(
        description = "Update a repository's dev server script. The dev server script starts the development server for the repository."
    )]
    async fn update_dev_server_script(
        &self,
        Parameters(UpdateDevServerScriptRequest { repo_id, script }): Parameters<
            UpdateDevServerScriptRequest,
        >,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/repos/{}", repo_id));
        let script_value = if script.is_empty() {
            None
        } else {
            Some(script)
        };
        let payload = serde_json::json!({
            "dev_server_script": script_value
        });
        let _repo: Repo = match self.send_json(self.client.put(&url).json(&payload)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };
        TaskServer::success(&UpdateRepoScriptResponse {
            success: true,
            repo_id: repo_id.to_string(),
            field: "dev_server_script".to_string(),
        })
    }

    #[tool(
        description = "List all the issues in a project. `project_id` is optional if running inside a workspace linked to a remote project."
    )]
    async fn list_issues(
        &self,
        Parameters(McpListIssuesRequest { project_id, limit }): Parameters<McpListIssuesRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let project_id = match self.resolve_project_id(project_id) {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        let url = self.url(&format!("/api/remote/issues?project_id={}", project_id));
        let response: ListIssuesResponse = match self.send_json(self.client.get(&url)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };

        let issue_limit = limit.unwrap_or(50).max(0) as usize;
        let limited: Vec<&Issue> = response.issues.iter().take(issue_limit).collect();
        let status_names_by_id =
            self.fetch_project_statuses(project_id)
                .await
                .ok()
                .map(|statuses| {
                    statuses
                        .into_iter()
                        .map(|status| (status.id, status.name))
                        .collect::<std::collections::HashMap<_, _>>()
                });

        let mut summaries = Vec::with_capacity(limited.len());
        for issue in &limited {
            summaries.push(self.issue_to_summary(issue, status_names_by_id.as_ref()));
        }

        TaskServer::success(&McpListIssuesResponse {
            count: summaries.len(),
            issues: summaries,
            project_id: project_id.to_string(),
        })
    }

    #[tool(
        description = "Start a new workspace session. A local task is auto-created under the first available project."
    )]
    async fn start_workspace_session(
        &self,
        Parameters(StartWorkspaceSessionRequest {
            title,
            executor,
            variant,
            repos,
            issue_id,
        }): Parameters<StartWorkspaceSessionRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        if repos.is_empty() {
            return Self::err("At least one repository must be specified.", None::<&str>);
        }

        let executor_trimmed = executor.trim();
        if executor_trimmed.is_empty() {
            return Self::err("Executor must not be empty.", None::<&str>);
        }

        let normalized_executor = executor_trimmed.replace('-', "_").to_ascii_uppercase();
        let base_executor = match BaseCodingAgent::from_str(&normalized_executor) {
            Ok(exec) => exec,
            Err(_) => {
                return Self::err(
                    format!("Unknown executor '{executor_trimmed}'."),
                    None::<String>,
                );
            }
        };

        let variant = variant.and_then(|v| {
            let trimmed = v.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });

        let executor_profile_id = ExecutorProfileId {
            executor: base_executor,
            variant,
        };

        // Derive project_id from first available project
        let projects: Vec<Project> = match self
            .send_json(self.client.get(self.url("/api/projects")))
            .await
        {
            Ok(projects) => projects,
            Err(e) => return Ok(e),
        };
        let project = match projects.first() {
            Some(p) => p,
            None => {
                return Self::err("No projects found. Create a project first.", None::<&str>);
            }
        };

        let workspace_repos: Vec<WorkspaceRepoInput> = repos
            .into_iter()
            .map(|r| WorkspaceRepoInput {
                repo_id: r.repo_id,
                target_branch: r.base_branch,
            })
            .collect();

        let payload = CreateAndStartTaskRequest {
            task: CreateTask::from_title_description(project.id, title, None),
            executor_profile_id,
            repos: workspace_repos,
            linked_issue: None,
        };

        // create-and-start returns the task; we need to fetch the workspace it created
        let url = self.url("/api/tasks/create-and-start");
        let task: TaskWithAttemptStatus =
            match self.send_json(self.client.post(&url).json(&payload)).await {
                Ok(task) => task,
                Err(e) => return Ok(e),
            };

        // Fetch workspaces for this task to get the workspace ID
        let url = self.url(&format!("/api/task-attempts?task_id={}", task.task.id));
        let workspaces: Vec<Workspace> = match self.send_json(self.client.get(&url)).await {
            Ok(workspaces) => workspaces,
            Err(e) => return Ok(e),
        };

        let workspace = match workspaces.first() {
            Some(w) => w,
            None => {
                return Self::err("Workspace was not created.", None::<&str>);
            }
        };

        // Link workspace to remote issue if issue_id is provided
        if let Some(issue_id) = issue_id
            && let Err(e) = self.link_workspace_to_issue(workspace.id, issue_id).await
        {
            return Ok(e);
        }

        let response = StartWorkspaceSessionResponse {
            workspace_id: workspace.id.to_string(),
        };

        TaskServer::success(&response)
    }

    #[tool(
        description = "Link an existing workspace to a remote issue. This associates the workspace with the issue for tracking."
    )]
    async fn link_workspace(
        &self,
        Parameters(McpLinkWorkspaceRequest {
            workspace_id,
            issue_id,
        }): Parameters<McpLinkWorkspaceRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        if let Err(e) = self.link_workspace_to_issue(workspace_id, issue_id).await {
            return Ok(e);
        }

        TaskServer::success(&McpLinkWorkspaceResponse {
            success: true,
            workspace_id: workspace_id.to_string(),
            issue_id: issue_id.to_string(),
        })
    }

    #[tool(
        description = "Update an existing issue's title, description, or status. `issue_id` is required. `title`, `description`, and `status` are optional."
    )]
    async fn update_issue(
        &self,
        Parameters(McpUpdateIssueRequest {
            issue_id,
            title,
            description,
            status,
        }): Parameters<McpUpdateIssueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // First get the issue to know its project_id for status resolution
        let get_url = self.url(&format!("/api/remote/issues/{}", issue_id));
        let existing_issue: Issue = match self.send_json(self.client.get(&get_url)).await {
            Ok(i) => i,
            Err(e) => return Ok(e),
        };

        // Resolve status name to status_id if provided
        let status_id = if let Some(ref status_name) = status {
            match self
                .resolve_status_id(existing_issue.project_id, status_name)
                .await
            {
                Ok(id) => Some(id),
                Err(e) => return Ok(e),
            }
        } else {
            None
        };

        // Expand @tagname references in description
        let expanded_description = match description {
            Some(desc) => Some(Some(self.expand_tags(&desc).await)),
            None => None,
        };

        let payload = api_types::UpdateIssueRequest {
            status_id,
            title,
            description: expanded_description,
            priority: None,
            start_date: None,
            target_date: None,
            completed_at: None,
            sort_order: None,
            parent_issue_id: None,
            parent_issue_sort_order: None,
            extension_metadata: None,
        };

        let url = self.url(&format!("/api/remote/issues/{}", issue_id));
        let response: MutationResponse<Issue> =
            match self.send_json(self.client.patch(&url).json(&payload)).await {
                Ok(r) => r,
                Err(e) => return Ok(e),
            };

        let details = self.issue_to_details(&response.data).await;
        TaskServer::success(&McpUpdateIssueResponse { issue: details })
    }

    #[tool(description = "Delete an issue. `issue_id` is required.")]
    async fn delete_issue(
        &self,
        Parameters(McpDeleteIssueRequest { issue_id }): Parameters<McpDeleteIssueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/remote/issues/{}", issue_id));
        if let Err(e) = self.send_empty_json(self.client.delete(&url)).await {
            return Ok(e);
        }

        TaskServer::success(&McpDeleteIssueResponse {
            deleted_issue_id: Some(issue_id.to_string()),
        })
    }

    #[tool(
        description = "Get detailed information about a specific issue. You can use `list_issues` to find issue IDs. `issue_id` is required."
    )]
    async fn get_issue(
        &self,
        Parameters(McpGetIssueRequest { issue_id }): Parameters<McpGetIssueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/remote/issues/{}", issue_id));
        let issue: Issue = match self.send_json(self.client.get(&url)).await {
            Ok(i) => i,
            Err(e) => return Ok(e),
        };

        let details = self.issue_to_details(&issue).await;
        TaskServer::success(&McpGetIssueResponse { issue: details })
    }
}

#[tool_handler]
impl ServerHandler for TaskServer {
    fn get_info(&self) -> ServerInfo {
        let mut instruction = "A task and project management server. If you need to create or update tickets or issues then use these tools. Most of them absolutely require that you pass the `project_id` of the project that you are currently working on. You can get project ids by using `list projects`. Call `list_issues` to fetch the `issue_ids` of all the issues in a project. TOOLS: 'list_organizations', 'list_projects', 'list_issues', 'create_issue', 'start_workspace_session', 'get_issue', 'update_issue', 'delete_issue', 'list_repos', 'get_repo', 'update_setup_script', 'update_cleanup_script', 'update_dev_server_script'. Make sure to pass `project_id`, `issue_id`, or `repo_id` where required. You can use list tools to get the available ids.".to_string();
        if self.context.is_some() {
            let context_instruction = "Use 'get_context' to fetch project/issue/workspace metadata for the active Vibe Kanban workspace session when available.";
            instruction = format!("{} {}", context_instruction, instruction);
        }

        ServerInfo {
            protocol_version: ProtocolVersion::V_2025_03_26,
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            server_info: Implementation {
                name: "vibe-kanban".to_string(),
                version: "1.0.0".to_string(),
            },
            instructions: Some(instruction),
        }
    }
}
