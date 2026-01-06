use std::{future::Future, str::FromStr};

use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessStatus},
    project::Project,
    repo::Repo,
    tag::Tag,
    task::{CreateTask, Task, TaskStatus, TaskWithAttemptStatus, UpdateTask},
    workspace::{Workspace, WorkspaceContext},
    workspace_repo::RepoWithTargetBranch,
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
    containers::ContainerQuery,
    task_attempts::{CreateTaskAttemptBody, WorkspaceRepoInput},
};

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateTaskRequest {
    #[schemars(description = "The ID of the project to create the task in. This is required!")]
    pub project_id: Uuid,
    #[schemars(description = "The title of the task")]
    pub title: String,
    #[schemars(description = "Optional description of the task")]
    pub description: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct CreateTaskResponse {
    pub task_id: String,
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
    fn from_project(project: Project) -> Self {
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
pub struct ListReposRequest {
    #[schemars(description = "The ID of the project to list repositories from")]
    pub project_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ListReposResponse {
    pub repos: Vec<McpRepoSummary>,
    pub count: usize,
    pub project_id: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ListProjectsResponse {
    pub projects: Vec<ProjectSummary>,
    pub count: usize,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListTasksRequest {
    #[schemars(description = "The ID of the project to list tasks from")]
    pub project_id: Uuid,
    #[schemars(
        description = "Optional status filter: 'todo', 'inprogress', 'inreview', 'done', 'cancelled'"
    )]
    pub status: Option<String>,
    #[schemars(description = "Maximum number of tasks to return (default: 50)")]
    pub limit: Option<i32>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct TaskSummary {
    #[schemars(description = "The unique identifier of the task")]
    pub id: String,
    #[schemars(description = "The title of the task")]
    pub title: String,
    #[schemars(description = "Current status of the task")]
    pub status: String,
    #[schemars(description = "When the task was created")]
    pub created_at: String,
    #[schemars(description = "When the task was last updated")]
    pub updated_at: String,
    #[schemars(description = "Whether the task has an in-progress execution attempt")]
    pub has_in_progress_attempt: Option<bool>,
    #[schemars(description = "Whether the last execution attempt failed")]
    pub last_attempt_failed: Option<bool>,
}

impl TaskSummary {
    fn from_task_with_status(task: TaskWithAttemptStatus) -> Self {
        Self {
            id: task.id.to_string(),
            title: task.title.to_string(),
            status: task.status.to_string(),
            created_at: task.created_at.to_rfc3339(),
            updated_at: task.updated_at.to_rfc3339(),
            has_in_progress_attempt: Some(task.has_in_progress_attempt),
            last_attempt_failed: Some(task.last_attempt_failed),
        }
    }
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct TaskDetails {
    #[schemars(description = "The unique identifier of the task")]
    pub id: String,
    #[schemars(description = "The title of the task")]
    pub title: String,
    #[schemars(description = "Optional description of the task")]
    pub description: Option<String>,
    #[schemars(description = "Current status of the task")]
    pub status: String,
    #[schemars(description = "When the task was created")]
    pub created_at: String,
    #[schemars(description = "When the task was last updated")]
    pub updated_at: String,
    #[schemars(description = "Whether the task has an in-progress execution attempt")]
    pub has_in_progress_attempt: Option<bool>,
    #[schemars(description = "Whether the last execution attempt failed")]
    pub last_attempt_failed: Option<bool>,
}

impl TaskDetails {
    fn from_task(task: Task) -> Self {
        Self {
            id: task.id.to_string(),
            title: task.title,
            description: task.description,
            status: task.status.to_string(),
            created_at: task.created_at.to_rfc3339(),
            updated_at: task.updated_at.to_rfc3339(),
            has_in_progress_attempt: None,
            last_attempt_failed: None,
        }
    }
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ListTasksResponse {
    pub tasks: Vec<TaskSummary>,
    pub count: usize,
    pub project_id: String,
    pub applied_filters: ListTasksFilters,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ListTasksFilters {
    pub status: Option<String>,
    pub limit: i32,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateTaskRequest {
    #[schemars(description = "The ID of the task to update")]
    pub task_id: Uuid,
    #[schemars(description = "New title for the task")]
    pub title: Option<String>,
    #[schemars(description = "New description for the task")]
    pub description: Option<String>,
    #[schemars(description = "New status: 'todo', 'inprogress', 'inreview', 'done', 'cancelled'")]
    pub status: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct UpdateTaskResponse {
    pub task: TaskDetails,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct DeleteTaskRequest {
    #[schemars(description = "The ID of the task to delete")]
    pub task_id: Uuid,
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
    #[schemars(description = "The ID of the task to start")]
    pub task_id: Uuid,
    #[schemars(
        description = "The coding agent executor to run ('CLAUDE_CODE', 'CODEX', 'GEMINI', 'CURSOR_AGENT', 'OPENCODE')"
    )]
    pub executor: String,
    #[schemars(description = "Optional executor variant, if needed")]
    pub variant: Option<String>,
    #[schemars(description = "Base branch for each repository in the project")]
    pub repos: Vec<McpWorkspaceRepoInput>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct StartWorkspaceSessionResponse {
    pub task_id: String,
    pub workspace_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct StartTaskAttemptRequest {
    #[schemars(description = "The ID of the task to start")]
    pub task_id: Uuid,
    #[schemars(
        description = "The coding agent executor to run ('CLAUDE_CODE', 'CODEX', 'GEMINI', 'CURSOR_AGENT', 'OPENCODE')"
    )]
    pub executor: String,
    #[schemars(description = "Optional executor variant, if needed")]
    pub variant: Option<String>,
    #[schemars(description = "The base branch to use for the attempt")]
    pub base_branch: String,
}

#[derive(Debug, Serialize, Deserialize, schemars::JsonSchema)]
pub struct StartTaskAttemptResponse {
    pub task_id: String,
    pub attempt_id: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct DeleteTaskResponse {
    pub deleted_task_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetTaskRequest {
    #[schemars(description = "The ID of the task to retrieve")]
    pub task_id: Uuid,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateAndStartSubTaskRequest {
    #[schemars(description = "The ID of the parent task attempt")]
    pub parent_task_attempt_id: Uuid,
    #[schemars(description = "The title of the subtask")]
    pub title: String,
    #[schemars(description = "Optional description of the subtask")]
    pub description: Option<String>,
    #[schemars(description = "The coding agent executor to run ('CLAUDE_CODE', 'CODEX', 'GEMINI', 'CURSOR_AGENT', 'OPENCODE')")]
    pub executor: String,
    #[schemars(description = "Optional executor variant, if needed")]
    pub variant: Option<String>,
    #[schemars(description = "The base branch to use for the attempt (defaults to parent's target branch)")]
    pub base_branch: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct CreateAndStartSubTaskResponse {
    pub task_id: String,
    pub attempt_id: String,
    pub parent_task_attempt_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct TailTaskLogRequest {
    #[schemars(description = "The ID of the task attempt to tail logs from")]
    pub task_attempt_id: Uuid,
    #[schemars(description = "Number of recent lines to fetch (default: 100, max: 1000)")]
    pub lines: Option<i32>,
    #[schemars(description = "Whether to stream new lines as they're generated")]
    pub follow: Option<bool>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct TailTaskLogResponse {
    pub task_attempt_id: String,
    pub lines: Vec<String>,
    pub has_more: bool,
    pub ws_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ExecutionLogsResult {
    lines: Vec<String>,
    has_more: bool,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListTaskAttemptsRequest {
    #[schemars(description = "Optional task ID to filter attempts by")]
    pub task_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct WaitForAttemptStatusRequest {
    #[schemars(description = "The task_attempt_id to wait on")]
    pub task_attempt_id: Uuid,
    #[schemars(description = "Polling interval in seconds (default 5)")]
    pub interval_seconds: Option<u64>,
    #[schemars(description = "Timeout in seconds (default 300)")]
    pub timeout_seconds: Option<u64>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct WaitForAttemptStatusResponse {
    pub attempt_id: String,
    pub status: String,
    pub process_statuses: Vec<String>,
    pub polled: u32,
    pub has_running: bool,
    pub has_failures: bool,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct MergeTaskAttemptRequest {
    #[schemars(description = "The task attempt ID to merge into its target branch")]
    pub task_attempt_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct GetTaskResponse {
    pub task: TaskDetails,
}

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
    pub project_id: Uuid,
    pub task_id: Uuid,
    pub task_title: String,
    pub workspace_id: Uuid,
    pub workspace_branch: String,
    #[schemars(
        description = "Repository info and target branches for each repo in this workspace"
    )]
    pub workspace_repos: Vec<McpRepoContext>,
}

impl TaskServer {
    /// Remove noisy protocol envelopes (e.g. codex/agent_message_* deltas) from log lines.
    fn filter_noisy_logs(lines: Vec<String>) -> Vec<String> {
        lines
            .into_iter()
            .filter_map(|line| {
                let trimmed = line.trim();
                if trimmed.starts_with('{') {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                        if val.get("method").is_some() {
                            return None;
                        }
                    }
                }
                Some(line)
            })
            .collect()
    }

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

        // Map RepoWithTargetBranch to McpRepoContext
        let workspace_repos: Vec<McpRepoContext> = ctx
            .workspace_repos
            .into_iter()
            .map(|rwb| McpRepoContext {
                repo_id: rwb.repo.id,
                repo_name: rwb.repo.name,
                target_branch: rwb.target_branch,
            })
            .collect();

        Some(McpContext {
            project_id: ctx.project.id,
            task_id: ctx.task.id,
            task_title: ctx.task.title,
            workspace_id: ctx.workspace.id,
            workspace_branch: ctx.workspace.branch,
            workspace_repos,
        })
    }
}

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

    fn url(&self, path: &str) -> String {
        format!(
            "{}/{}",
            self.base_url.trim_end_matches('/'),
            path.trim_start_matches('/')
        )
    }

    /// Expands @tagname references in text by replacing them with tag content.
    /// Returns the original text if expansion fails (e.g., network error).
    /// Unknown tags are left as-is (not expanded, not an error).
    async fn expand_tags(&self, text: &str) -> String {
        // Pattern matches @tagname where tagname is non-whitespace, non-@ characters
        let tag_pattern = match Regex::new(r"@([^\s@]+)") {
            Ok(re) => re,
            Err(_) => return text.to_string(),
        };

        // Find all unique tag names referenced in the text
        let tag_names: Vec<String> = tag_pattern
            .captures_iter(text)
            .filter_map(|cap| cap.get(1).map(|m| m.as_str().to_string()))
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();

        if tag_names.is_empty() {
            return text.to_string();
        }

        // Fetch all tags from the API
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

        // Build a map of tag_name -> content for quick lookup
        let tag_map: std::collections::HashMap<&str, &str> = tags
            .iter()
            .map(|t| (t.tag_name.as_str(), t.content.as_str()))
            .collect();

        // Replace each @tagname with its content (if found)
        let result = tag_pattern.replace_all(text, |caps: &regex::Captures| {
            let tag_name = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            match tag_map.get(tag_name) {
                Some(content) => (*content).to_string(),
                None => caps.get(0).map(|m| m.as_str()).unwrap_or("").to_string(),
            }
        });

        result.into_owned()
    }
}

#[tool_router]
impl TaskServer {
    #[tool(
        description = "Return project, task, and workspace metadata for the current workspace session context."
    )]
    async fn get_context(&self) -> Result<CallToolResult, ErrorData> {
        // Context was fetched at startup and cached
        // This tool is only registered if context exists, so unwrap is safe
        let context = self.context.as_ref().expect("VK context should exist");
        TaskServer::success(context)
    }

    #[tool(
        description = "Create a new task/ticket in a project. Always pass the `project_id` of the project you want to create the task in - it is required!"
    )]
    async fn create_task(
        &self,
        Parameters(CreateTaskRequest {
            project_id,
            title,
            description,
        }): Parameters<CreateTaskRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // Expand @tagname references in description
        let expanded_description = match description {
            Some(desc) => Some(self.expand_tags(&desc).await),
            None => None,
        };

        let url = self.url("/api/tasks");

        let task: Task = match self
            .send_json(
                self.client
                    .post(&url)
                    .json(&CreateTask::from_title_description(
                        project_id,
                        title,
                        expanded_description,
                    )),
            )
            .await
        {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        TaskServer::success(&CreateTaskResponse {
            task_id: task.id.to_string(),
        })
    }

    #[tool(description = "List all the available projects")]
    async fn list_projects(&self) -> Result<CallToolResult, ErrorData> {
        let url = self.url("/api/projects");
        let projects: Vec<Project> = match self.send_json(self.client.get(&url)).await {
            Ok(ps) => ps,
            Err(e) => return Ok(e),
        };

        let project_summaries: Vec<ProjectSummary> = projects
            .into_iter()
            .map(ProjectSummary::from_project)
            .collect();

        let response = ListProjectsResponse {
            count: project_summaries.len(),
            projects: project_summaries,
        };

        TaskServer::success(&response)
    }

    #[tool(description = "List all repositories for a project. `project_id` is required!")]
    async fn list_repos(
        &self,
        Parameters(ListReposRequest { project_id }): Parameters<ListReposRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/projects/{}/repositories", project_id));
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
            project_id: project_id.to_string(),
        };

        TaskServer::success(&response)
    }

    #[tool(
        description = "List all the task/tickets in a project with optional filtering and execution status. `project_id` is required!"
    )]
    async fn list_tasks(
        &self,
        Parameters(ListTasksRequest {
            project_id,
            status,
            limit,
        }): Parameters<ListTasksRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let status_filter = if let Some(ref status_str) = status {
            match TaskStatus::from_str(status_str) {
                Ok(s) => Some(s),
                Err(_) => {
                    return Self::err(
                        "Invalid status filter. Valid values: 'todo', 'inprogress', 'inreview', 'done', 'cancelled'".to_string(),
                        Some(status_str.to_string()),
                    );
                }
            }
        } else {
            None
        };

        let url = self.url(&format!("/api/tasks?project_id={}", project_id));
        let all_tasks: Vec<TaskWithAttemptStatus> =
            match self.send_json(self.client.get(&url)).await {
                Ok(t) => t,
                Err(e) => return Ok(e),
            };

        let task_limit = limit.unwrap_or(50).max(0) as usize;
        let filtered = all_tasks.into_iter().filter(|t| {
            if let Some(ref want) = status_filter {
                &t.status == want
            } else {
                true
            }
        });
        let limited: Vec<TaskWithAttemptStatus> = filtered.take(task_limit).collect();

        let task_summaries: Vec<TaskSummary> = limited
            .into_iter()
            .map(TaskSummary::from_task_with_status)
            .collect();

        let response = ListTasksResponse {
            count: task_summaries.len(),
            tasks: task_summaries,
            project_id: project_id.to_string(),
            applied_filters: ListTasksFilters {
                status: status.clone(),
                limit: task_limit as i32,
            },
        };

        TaskServer::success(&response)
    }

    #[tool(
        description = "Start working on a task by creating and launching a new workspace session."
    )]
    async fn start_workspace_session(
        &self,
        Parameters(StartWorkspaceSessionRequest {
            task_id,
            executor,
            variant,
            repos,
        }): Parameters<StartWorkspaceSessionRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        if repos.is_empty() {
            return Self::err(
                "At least one repository must be specified.".to_string(),
                None::<String>,
            );
        }

        let executor_trimmed = executor.trim();
        if executor_trimmed.is_empty() {
            return Self::err("Executor must not be empty.".to_string(), None::<String>);
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

        let workspace_repos: Vec<WorkspaceRepoInput> = repos
            .into_iter()
            .map(|r| WorkspaceRepoInput {
                repo_id: r.repo_id,
                target_branch: r.base_branch,
            })
            .collect();

        let payload = CreateTaskAttemptBody {
            task_id,
            executor_profile_id,
            repos: workspace_repos,
        };

        let url = self.url("/api/task-attempts");
        let workspace: Workspace = match self.send_json(self.client.post(&url).json(&payload)).await
        {
            Ok(workspace) => workspace,
            Err(e) => return Ok(e),
        };

        let response = StartWorkspaceSessionResponse {
            task_id: workspace.task_id.to_string(),
            workspace_id: workspace.id.to_string(),
        };

        TaskServer::success(&response)
    }

    #[tool(description = "Start working on a task by creating and launching a new task attempt.")]
    async fn start_task_attempt(
        &self,
        Parameters(StartTaskAttemptRequest {
            task_id,
            executor,
            variant,
            base_branch,
        }): Parameters<StartTaskAttemptRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let base_branch = base_branch.trim().to_string();
        if base_branch.is_empty() {
            return Self::err("Base branch must not be empty.".to_string(), None::<String>);
        }

        let executor_trimmed = executor.trim();
        if executor_trimmed.is_empty() {
            return Self::err("Executor must not be empty.".to_string(), None::<String>);
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

        // Fetch task to get project_id
        let task_url = self.url(&format!("/api/tasks/{}", task_id));
        let task: Task = match self.send_json(self.client.get(&task_url)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        // List repositories for the project and apply the base branch
        let repos_url = self.url(&format!("/api/projects/{}/repositories", task.project_id));
        let repos: Vec<Repo> = match self.send_json(self.client.get(&repos_url)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };

        if repos.is_empty() {
            return Self::err(
                "Project has no repositories configured.".to_string(),
                None::<String>,
            );
        }

        let workspace_repos: Vec<WorkspaceRepoInput> = repos
            .into_iter()
            .map(|r| WorkspaceRepoInput {
                repo_id: r.id,
                target_branch: base_branch.clone(),
            })
            .collect();

        let payload = CreateTaskAttemptBody {
            task_id,
            executor_profile_id,
            repos: workspace_repos,
        };

        let url = self.url("/api/task-attempts");
        let workspace: Workspace = match self.send_json(self.client.post(&url).json(&payload)).await
        {
            Ok(workspace) => workspace,
            Err(e) => return Ok(e),
        };

        let response = StartTaskAttemptResponse {
            task_id: workspace.task_id.to_string(),
            attempt_id: workspace.id.to_string(),
        };

        TaskServer::success(&response)
    }

    #[tool(description = "Create a subtask and immediately start execution")]
    async fn create_and_start_sub_task(
        &self,
        Parameters(CreateAndStartSubTaskRequest {
            parent_task_attempt_id,
            title,
            description,
            executor,
            variant,
            base_branch,
        }): Parameters<CreateAndStartSubTaskRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let executor_trimmed = executor.trim();
        if executor_trimmed.is_empty() {
            return Self::err("Executor must not be empty.".to_string(), None::<String>);
        }

        // Load parent workspace + task to get project_id
        let parent_workspace_url =
            self.url(&format!("/api/task-attempts/{}", parent_task_attempt_id));
        let parent_workspace: Workspace =
            match self.send_json(self.client.get(&parent_workspace_url)).await {
                Ok(w) => w,
                Err(e) => return Ok(e),
            };

        let parent_task_url = self.url(&format!("/api/tasks/{}", parent_workspace.task_id));
        let parent_task: Task = match self.send_json(self.client.get(&parent_task_url)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        let expanded_description = match description {
            Some(desc) => Some(self.expand_tags(&desc).await),
            None => None,
        };

        // Create subtask with parent_workspace_id
        let create_payload = CreateTask {
            project_id: parent_task.project_id,
            title,
            description: expanded_description,
            status: Some(TaskStatus::Todo),
            parent_workspace_id: Some(parent_task_attempt_id),
            image_ids: None,
            shared_task_id: None,
        };

        let task_url = self.url("/api/tasks");
        let created_task: Task = match self
            .send_json(self.client.post(&task_url).json(&create_payload))
            .await
        {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        // Determine base branch for the new attempt
        let base_branch_to_use = if let Some(branch) = base_branch {
            let trimmed = branch.trim().to_string();
            if trimmed.is_empty() {
                return Self::err("Base branch must not be empty.".to_string(), None::<String>);
            }
            trimmed
        } else {
            let repos_url = self.url(&format!(
                "/api/task-attempts/{}/repos",
                parent_task_attempt_id
            ));
            let repos: Vec<RepoWithTargetBranch> =
                match self.send_json(self.client.get(&repos_url)).await {
                    Ok(r) => r,
                    Err(e) => return Ok(e),
                };

            match repos.first() {
                Some(repo) => repo.target_branch.clone(),
                None => {
                    return Self::err(
                        "Unable to determine base branch from parent attempt.".to_string(),
                        None::<String>,
                    );
                }
            }
        };

        // Start attempt for the new task
        // Start attempt for the new task (inline, to avoid parsing tool output)
        let start_payload = StartTaskAttemptRequest {
            task_id: created_task.id,
            executor,
            variant,
            base_branch: base_branch_to_use,
        };

        let executor_trimmed = start_payload.executor.trim();
        if executor_trimmed.is_empty() {
            return Self::err("Executor must not be empty.".to_string(), None::<String>);
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

        let variant = start_payload.variant.and_then(|v| {
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

        let repos_url = self.url(&format!(
            "/api/projects/{}/repositories",
            parent_task.project_id
        ));
        let repos: Vec<Repo> = match self.send_json(self.client.get(&repos_url)).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };

        if repos.is_empty() {
            return Self::err(
                "Project has no repositories configured.".to_string(),
                None::<String>,
            );
        }

        let workspace_repos: Vec<WorkspaceRepoInput> = repos
            .into_iter()
            .map(|r| WorkspaceRepoInput {
                repo_id: r.id,
                target_branch: start_payload.base_branch.clone(),
            })
            .collect();

        let attempt_payload = CreateTaskAttemptBody {
            task_id: start_payload.task_id,
            executor_profile_id,
            repos: workspace_repos,
        };

        let url = self.url("/api/task-attempts");
        let workspace: Workspace = match self.send_json(self.client.post(&url).json(&attempt_payload)).await
        {
            Ok(workspace) => workspace,
            Err(e) => return Ok(e),
        };

        let attempt_id = workspace.id.to_string();

        let response = CreateAndStartSubTaskResponse {
            task_id: created_task.id.to_string(),
            attempt_id,
            parent_task_attempt_id: parent_task_attempt_id.to_string(),
        };

        TaskServer::success(&response)
    }

    #[tool(description = "Fetch or stream logs from a task attempt execution")]
    async fn tail_task_log(
        &self,
        Parameters(TailTaskLogRequest {
            task_attempt_id,
            lines,
            follow,
        }): Parameters<TailTaskLogRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let follow_requested = follow.unwrap_or(false);

        if follow_requested {
            let ws_url = format!(
                "{}/api/execution-processes/stream/ws?workspace_id={}",
                self.base_url.trim_end_matches('/'),
                task_attempt_id
            );

            let response = TailTaskLogResponse {
                task_attempt_id: task_attempt_id.to_string(),
                lines: vec!["Real-time log streaming is available via the WebSocket URL".to_string()],
                has_more: true,
                ws_url: Some(ws_url),
            };

            TaskServer::success(&response)
        } else {
            let max_lines = lines.unwrap_or(100).clamp(1, 1000);
            let url = self.url("/api/execution-processes/logs");

            let logs: ExecutionLogsResult = match self
                .send_json(
                    self.client
                        .get(&url)
                        .query(&[
                            ("workspace_id", task_attempt_id.to_string()),
                            ("lines", max_lines.to_string()),
                        ]),
                )
                .await
            {
                Ok(resp) => resp,
                Err(e) => return Ok(e),
            };

            let filtered_lines = Self::filter_noisy_logs(logs.lines);

            let log_text = filtered_lines.join("\n");
            let mut output = format!(
                "Logs for task attempt {} (showing {} lines):\n\n{}",
                task_attempt_id,
                filtered_lines.len(),
                log_text
            );

            if logs.has_more {
                output.push_str("\n\n... (more logs available, increase 'lines' parameter or use 'follow=true')");
            }

            Ok(CallToolResult::success(vec![Content::text(output)]))
        }
    }

    #[tool(description = "List task attempts, optionally filtered by task_id")]
    async fn list_task_attempts(
        &self,
        Parameters(ListTaskAttemptsRequest { task_id }): Parameters<ListTaskAttemptsRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let mut url = self.url("/api/task-attempts");
        if let Some(id) = task_id {
            url = format!("{url}?task_id={id}");
        }

        let attempts: Vec<Workspace> = match self.send_json(self.client.get(&url)).await {
            Ok(list) => list,
            Err(e) => return Ok(e),
        };

        TaskServer::success(&attempts)
    }

    #[tool(description = "Wait for a task attempt to reach a terminal status (completed/failed) with optional timeout and polling interval")]
    async fn wait_for_attempt_status(
        &self,
        Parameters(WaitForAttemptStatusRequest {
            task_attempt_id,
            interval_seconds,
            timeout_seconds,
        }): Parameters<WaitForAttemptStatusRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let interval = std::time::Duration::from_secs(interval_seconds.unwrap_or(5).max(1));
        let timeout = std::time::Duration::from_secs(timeout_seconds.unwrap_or(300).max(1));
        let start = std::time::Instant::now();
        let mut polls = 0u32;

        loop {
            let url = self.url("/api/execution-processes");
            let processes: Vec<ExecutionProcess> = match self
                .send_json(self.client.get(&url).query(&[(
                    "workspace_id",
                    task_attempt_id.to_string(),
                )]))
                .await
            {
                Ok(p) => p,
                Err(e) => return Ok(e),
            };

            polls += 1;

            let statuses: Vec<ExecutionProcessStatus> =
                processes.iter().map(|p| p.status.clone()).collect();

            let has_running = statuses
                .iter()
                .any(|s| *s == ExecutionProcessStatus::Running);
            let has_failures =
                statuses.iter().any(|s| matches!(s, ExecutionProcessStatus::Failed | ExecutionProcessStatus::Killed));

            let overall_status = if has_failures {
                "failed"
            } else if !has_running && !statuses.is_empty() {
                "completed"
            } else {
                "running"
            };

            if overall_status != "running" {
                let resp = WaitForAttemptStatusResponse {
                    attempt_id: task_attempt_id.to_string(),
                    status: overall_status.to_string(),
                    process_statuses: statuses
                        .iter()
                        .map(|s| format!("{s:?}").to_lowercase())
                        .collect(),
                    polled: polls,
                    has_running,
                    has_failures,
                };
                return TaskServer::success(&resp);
            }

            if start.elapsed() >= timeout {
                return Self::err(
                    "Timed out waiting for attempt to finish".to_string(),
                    Some(format!(
                        "Waited {}s for attempt {}",
                        timeout.as_secs(),
                        task_attempt_id
                    )),
                );
            }

            tokio::time::sleep(interval).await;
        }
    }

    #[tool(description = "Merge a task attempt's branch into its target branch")]
    async fn merge_task_attempt(
        &self,
        Parameters(MergeTaskAttemptRequest { task_attempt_id }): Parameters<MergeTaskAttemptRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let merge_url = self.url(&format!("/api/task-attempts/{}/merge", task_attempt_id));
        match self
            .send_json::<serde_json::Value>(self.client.post(&merge_url))
            .await
        {
            Ok(_) => TaskServer::success(&serde_json::json!({
                "task_attempt_id": task_attempt_id,
                "merged": true
            })),
            Err(e) => Ok(e),
        }
    }

    #[tool(
        description = "Update an existing task/ticket's title, description, or status. `project_id` and `task_id` are required! `title`, `description`, and `status` are optional."
    )]
    async fn update_task(
        &self,
        Parameters(UpdateTaskRequest {
            task_id,
            title,
            description,
            status,
        }): Parameters<UpdateTaskRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let status = if let Some(ref status_str) = status {
            match TaskStatus::from_str(status_str) {
                Ok(s) => Some(s),
                Err(_) => {
                    return Self::err(
                        "Invalid status filter. Valid values: 'todo', 'inprogress', 'inreview', 'done', 'cancelled'".to_string(),
                        Some(status_str.to_string()),
                    );
                }
            }
        } else {
            None
        };

        // Expand @tagname references in description
        let expanded_description = match description {
            Some(desc) => Some(self.expand_tags(&desc).await),
            None => None,
        };

        let payload = UpdateTask {
            title,
            description: expanded_description,
            status,
            parent_workspace_id: None,
            image_ids: None,
        };
        let url = self.url(&format!("/api/tasks/{}", task_id));
        let updated_task: Task = match self.send_json(self.client.put(&url).json(&payload)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        let details = TaskDetails::from_task(updated_task);
        let repsonse = UpdateTaskResponse { task: details };
        TaskServer::success(&repsonse)
    }

    #[tool(
        description = "Delete a task/ticket from a project. `project_id` and `task_id` are required!"
    )]
    async fn delete_task(
        &self,
        Parameters(DeleteTaskRequest { task_id }): Parameters<DeleteTaskRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/tasks/{}", task_id));
        if let Err(e) = self
            .send_json::<serde_json::Value>(self.client.delete(&url))
            .await
        {
            return Ok(e);
        }

        let repsonse = DeleteTaskResponse {
            deleted_task_id: Some(task_id.to_string()),
        };

        TaskServer::success(&repsonse)
    }

    #[tool(
        description = "Get detailed information (like task description) about a specific task/ticket. You can use `list_tasks` to find the `task_ids` of all tasks in a project. `project_id` and `task_id` are required!"
    )]
    async fn get_task(
        &self,
        Parameters(GetTaskRequest { task_id }): Parameters<GetTaskRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/tasks/{}", task_id));
        let task: Task = match self.send_json(self.client.get(&url)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        let details = TaskDetails::from_task(task);
        let response = GetTaskResponse { task: details };

        TaskServer::success(&response)
    }
}

#[tool_handler]
impl ServerHandler for TaskServer {
    fn get_info(&self) -> ServerInfo {
        let mut instruction = "A task and project management server. If you need to create or update tickets or tasks then use these tools. Most of them absolutely require that you pass the `project_id` of the project that you are currently working on. You can get project ids by using `list projects`. Call `list_tasks` to fetch the `task_ids` of all the tasks in a project`.. TOOLS: 'list_projects', 'list_tasks', 'create_task', 'start_workspace_session', 'start_task_attempt', 'create_and_start_sub_task', 'list_task_attempts', 'wait_for_attempt_status', 'merge_task_attempt', 'tail_task_log', 'get_task', 'update_task', 'delete_task', 'list_repos'. Make sure to pass `project_id` or `task_id` where required. You can use list tools to get the available ids.".to_string();
        if self.context.is_some() {
            let context_instruction = "Use 'get_context' to fetch project/task/workspace metadata for the active Vibe Kanban workspace session when available.";
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
