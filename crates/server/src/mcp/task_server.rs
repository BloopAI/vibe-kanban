use std::{future::Future, str::FromStr};

use db::models::{
    project::Project,
    repo::Repo,
    tag::Tag,
    task::{CreateTask, Task, TaskStatus, TaskWithAttemptStatus, UpdateTask},
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
    #[schemars(description = "Task priority: 'urgent', 'high', 'medium', or 'low'. Defaults to 'medium' if not specified.")]
    pub priority: Option<String>,
    #[schemars(description = "Optional list of task IDs that this task depends on (must be completed before this task)")]
    pub depends_on: Option<Vec<String>>,
    #[schemars(description = "If true, check for duplicate tasks before creating. Returns existing task if found.")]
    pub check_duplicate: Option<bool>,
    #[schemars(description = "Optional list of label IDs to attach to the task")]
    pub label_ids: Option<Vec<String>>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct CreateTaskResponse {
    pub task_id: String,
    #[schemars(description = "True if this is a new task, false if an existing duplicate was found")]
    pub is_new: bool,
    #[schemars(description = "Message about the task creation result")]
    pub message: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetProjectProgressRequest {
    #[schemars(description = "The ID of the project to get progress for")]
    pub project_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct GetProjectProgressResponse {
    #[schemars(description = "Total number of tasks in the project")]
    pub total_tasks: i32,
    #[schemars(description = "Number of completed (done) tasks")]
    pub completed_tasks: i32,
    #[schemars(description = "Number of in-progress tasks")]
    pub in_progress_tasks: i32,
    #[schemars(description = "Number of blocked tasks (has incomplete dependencies)")]
    pub blocked_tasks: i32,
    #[schemars(description = "Completion percentage (0-100)")]
    pub progress_percent: f32,
    #[schemars(description = "Summary by status")]
    pub status_summary: std::collections::HashMap<String, i32>,
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
        description = "The coding agent executor to run ('CLAUDE_CODE', 'AMP', 'GEMINI', 'CODEX', 'OPENCODE', 'CURSOR_AGENT', 'QWEN_CODE', 'COPILOT', 'DROID')"
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
pub struct GetPmContextRequest {
    #[schemars(description = "The ID of the project to get PM context for")]
    pub project_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct GetPmContextResponse {
    #[schemars(description = "The project ID")]
    pub project_id: String,
    #[schemars(description = "Whether this project has a PM task configured")]
    pub has_pm_task: bool,
    #[schemars(description = "The PM context if available")]
    pub pm_context: Option<McpPmContext>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct RequestPmReviewRequest {
    #[schemars(description = "The ID of the task to review")]
    pub task_id: Uuid,
    #[schemars(description = "Additional review instructions to include alongside the PM specs")]
    pub additional_instructions: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct RequestPmReviewResponse {
    #[schemars(description = "The task ID being reviewed")]
    pub task_id: String,
    #[schemars(description = "Whether this project has a PM task configured")]
    pub has_pm_task: bool,
    #[schemars(description = "The generated review prompt based on PM specs")]
    pub review_prompt: String,
    #[schemars(description = "Summary of what the review should check")]
    pub review_checklist: Vec<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdatePmDocsRequest {
    #[schemars(description = "The ID of the project to update PM docs for")]
    pub project_id: Uuid,
    #[schemars(description = "The new PM documentation content in markdown format")]
    pub content: String,
    #[schemars(
        description = "Mode: 'replace' to replace all docs, 'append' to add to existing docs. Defaults to 'append'."
    )]
    pub mode: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct UpdatePmDocsResponse {
    #[schemars(description = "The project ID that was updated")]
    pub project_id: String,
    #[schemars(description = "Whether the update was successful")]
    pub success: bool,
    #[schemars(description = "The updated PM docs content")]
    pub pm_docs: Option<String>,
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
pub struct McpPmContext {
    #[schemars(description = "The PM task ID for this project")]
    pub pm_task_id: Uuid,
    #[schemars(description = "The PM task title")]
    pub pm_task_title: String,
    #[schemars(description = "The PM task description containing project specs")]
    pub pm_task_description: Option<String>,
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
    #[schemars(description = "PM context if available - contains project specs from the PM task")]
    pub pm_context: Option<McpPmContext>,
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

        // Fetch PM context if project has a PM task configured
        let pm_context = if let Some(pm_task_id) = ctx.project.pm_task_id {
            // Try to fetch the PM task details
            let task_url = self.url(&format!("/api/tasks/{}", pm_task_id));
            let pm_task_response = tokio::time::timeout(
                std::time::Duration::from_millis(500),
                self.client.get(&task_url).send(),
            )
            .await
            .ok()
            .and_then(|r| r.ok());

            if let Some(resp) = pm_task_response {
                if resp.status().is_success() {
                    if let Ok(api_resp) = resp.json::<ApiResponseEnvelope<Task>>().await {
                        if api_resp.success {
                            api_resp.data.map(|pm_task| McpPmContext {
                                pm_task_id,
                                pm_task_title: pm_task.title,
                                pm_task_description: pm_task.description,
                            })
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        Some(McpContext {
            project_id: ctx.project.id,
            task_id: ctx.task.id,
            task_title: ctx.task.title,
            workspace_id: ctx.workspace.id,
            workspace_branch: ctx.workspace.branch,
            workspace_repos,
            pm_context,
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
        description = "Create a new task/ticket in a project. Always pass the `project_id` of the project you want to create the task in - it is required! Use check_duplicate=true to avoid creating duplicate tasks. Use depends_on to set task dependencies. Use label_ids to attach labels. Use priority to set task priority (urgent/high/medium/low)."
    )]
    async fn create_task(
        &self,
        Parameters(CreateTaskRequest {
            project_id,
            title,
            description,
            priority,
            depends_on,
            check_duplicate,
            label_ids,
        }): Parameters<CreateTaskRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // Check for duplicate tasks if requested
        if check_duplicate.unwrap_or(false) {
            let list_url = self.url(&format!("/api/projects/{}/tasks", project_id));
            let existing_tasks: Vec<Task> = match self.send_json(self.client.get(&list_url)).await {
                Ok(tasks) => tasks,
                Err(_) => vec![], // If we can't get tasks, proceed with creation
            };

            // Check for similar titles using extracted helper
            for existing in &existing_tasks {
                if Self::is_duplicate_title(&title, &existing.title) {
                    return TaskServer::success(&CreateTaskResponse {
                        task_id: existing.id.to_string(),
                        is_new: false,
                        message: Some(format!(
                            "Found existing similar task: '{}'. Returning existing task instead of creating duplicate.",
                            existing.title
                        )),
                    });
                }
            }
        }

        // Expand @tagname references in description
        let expanded_description = match description {
            Some(desc) => Some(self.expand_tags(&desc).await),
            None => None,
        };

        // Parse priority string to TaskPriority enum
        let task_priority = priority.as_ref().and_then(|p| {
            match p.to_lowercase().as_str() {
                "urgent" => Some(db::models::task::TaskPriority::Urgent),
                "high" => Some(db::models::task::TaskPriority::High),
                "medium" => Some(db::models::task::TaskPriority::Medium),
                "low" => Some(db::models::task::TaskPriority::Low),
                _ => None,
            }
        });

        let url = self.url("/api/tasks");

        let create_task_data = CreateTask {
            project_id,
            title: title.clone(),
            description: expanded_description,
            status: None,
            priority: task_priority,
            position: None,
            parent_workspace_id: None,
            image_ids: None,
            label_ids: None, // Labels are set separately after task creation
        };

        let task: Task = match self
            .send_json(
                self.client
                    .post(&url)
                    .json(&create_task_data),
            )
            .await
        {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        // Set dependencies if provided
        if let Some(dep_ids) = depends_on {
            if !dep_ids.is_empty() {
                let deps_url = self.url(&format!("/api/tasks/{}/dependencies", task.id));
                match self
                    .client
                    .put(&deps_url)
                    .json(&serde_json::json!({ "dependency_ids": dep_ids }))
                    .send()
                    .await
                {
                    Ok(resp) if resp.status().is_success() => {
                        tracing::debug!("Dependencies set successfully for task {}", task.id);
                    }
                    Ok(resp) => {
                        tracing::warn!(
                            "Failed to set dependencies for task {}: {}",
                            task.id,
                            resp.status()
                        );
                    }
                    Err(e) => {
                        tracing::error!("Error setting dependencies for task {}: {}", task.id, e);
                    }
                }
            }
        }

        // Set labels if provided
        if let Some(lbl_ids) = label_ids {
            if !lbl_ids.is_empty() {
                // Update task with label_ids via the update endpoint
                let update_url = self.url(&format!("/api/tasks/{}", task.id));
                match self
                    .client
                    .put(&update_url)
                    .json(&serde_json::json!({ "label_ids": lbl_ids }))
                    .send()
                    .await
                {
                    Ok(resp) if resp.status().is_success() => {
                        tracing::debug!("Labels attached successfully for task {}", task.id);
                    }
                    Ok(resp) => {
                        tracing::warn!(
                            "Failed to attach labels for task {}: {}",
                            task.id,
                            resp.status()
                        );
                    }
                    Err(e) => {
                        tracing::error!("Error attaching labels for task {}: {}", task.id, e);
                    }
                }
            }
        }

        TaskServer::success(&CreateTaskResponse {
            task_id: task.id.to_string(),
            is_new: true,
            message: Some(format!("Created new task: '{}'", title)),
        })
    }

    #[tool(
        description = "Get the progress/completion status of a project. Returns the number of tasks by status and completion percentage."
    )]
    async fn get_project_progress(
        &self,
        Parameters(GetProjectProgressRequest { project_id }): Parameters<GetProjectProgressRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let list_url = self.url(&format!("/api/projects/{}/tasks", project_id));
        let tasks: Vec<Task> = match self.send_json(self.client.get(&list_url)).await {
            Ok(tasks) => tasks,
            Err(e) => return Ok(e),
        };

        let total_tasks = tasks.len() as i32;
        let mut status_summary = std::collections::HashMap::new();
        let mut completed_tasks = 0;
        let mut in_progress_tasks = 0;

        for task in &tasks {
            let status_str = format!("{:?}", task.status).to_lowercase();
            *status_summary.entry(status_str.clone()).or_insert(0) += 1;

            if task.status == TaskStatus::Done {
                completed_tasks += 1;
            } else if task.status == TaskStatus::InProgress {
                in_progress_tasks += 1;
            }
        }

        // Calculate blocked tasks (those with incomplete dependencies)
        // This is a simplified check - ideally we'd query dependencies
        let blocked_tasks = 0; // Would need dependency info from API

        let progress_percent = Self::calculate_progress(total_tasks, completed_tasks);

        TaskServer::success(&GetProjectProgressResponse {
            total_tasks,
            completed_tasks,
            in_progress_tasks,
            blocked_tasks,
            progress_percent,
            status_summary,
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

    #[tool(
        description = "Update an existing task/ticket's title, description, or status. `task_id` is required. `title`, `description`, and `status` are optional."
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
            priority: None,
            position: None,
            parent_workspace_id: None,
            image_ids: None,
            label_ids: None,
        };
        let url = self.url(&format!("/api/tasks/{}", task_id));
        let updated_task: Task = match self.send_json(self.client.put(&url).json(&payload)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        let details = TaskDetails::from_task(updated_task);
        let response = UpdateTaskResponse { task: details };
        TaskServer::success(&response)
    }

    #[tool(description = "Delete a task/ticket. `task_id` is required.")]
    async fn delete_task(
        &self,
        Parameters(DeleteTaskRequest { task_id }): Parameters<DeleteTaskRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/tasks/{}", task_id));
        if let Err(e) = self.send_empty_json(self.client.delete(&url)).await {
            return Ok(e);
        }

        let response = DeleteTaskResponse {
            deleted_task_id: Some(task_id.to_string()),
        };

        TaskServer::success(&response)
    }

    #[tool(
        description = "Get detailed information (like task description) about a specific task/ticket. You can use `list_tasks` to find the `task_ids` of all tasks in a project. `task_id` is required."
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

    #[tool(
        description = "Get the PM (Project Manager) context for a project. Returns the project specification document stored in the PM task. Use this to understand project requirements, architecture, and guidelines before implementing tasks."
    )]
    async fn get_pm_context(
        &self,
        Parameters(GetPmContextRequest { project_id }): Parameters<GetPmContextRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // First, get the project to find the pm_task_id
        let url = self.url(&format!("/api/projects/{}", project_id));
        let project: Project = match self.send_json(self.client.get(&url)).await {
            Ok(p) => p,
            Err(e) => return Ok(e),
        };

        // If no PM task is configured, return empty context
        let Some(pm_task_id) = project.pm_task_id else {
            return TaskServer::success(&GetPmContextResponse {
                project_id: project_id.to_string(),
                has_pm_task: false,
                pm_context: None,
            });
        };

        // Fetch the PM task details
        let task_url = self.url(&format!("/api/tasks/{}", pm_task_id));
        let pm_task: Task = match self.send_json(self.client.get(&task_url)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        let pm_context = McpPmContext {
            pm_task_id,
            pm_task_title: pm_task.title,
            pm_task_description: pm_task.description,
        };

        TaskServer::success(&GetPmContextResponse {
            project_id: project_id.to_string(),
            has_pm_task: true,
            pm_context: Some(pm_context),
        })
    }

    #[tool(
        description = "Request a PM-based review for a task. This generates a review prompt based on the project's PM specifications. Use this when a task is ready for review (status: inreview) to verify the implementation matches the project requirements."
    )]
    async fn request_pm_review(
        &self,
        Parameters(RequestPmReviewRequest {
            task_id,
            additional_instructions,
        }): Parameters<RequestPmReviewRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // First, get the task to find the project_id
        let task_url = self.url(&format!("/api/tasks/{}", task_id));
        let task: Task = match self.send_json(self.client.get(&task_url)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        // Get the project to find the pm_task_id
        let project_url = self.url(&format!("/api/projects/{}", task.project_id));
        let project: Project = match self.send_json(self.client.get(&project_url)).await {
            Ok(p) => p,
            Err(e) => return Ok(e),
        };

        // If no PM task is configured, return a basic review prompt
        let Some(pm_task_id) = project.pm_task_id else {
            let basic_prompt = format!(
                "Review the implementation of task '{}' ({}).\n\n\
                No PM specifications are configured for this project.\n\n\
                Please review the code changes for:\n\
                - Code quality and best practices\n\
                - Potential bugs or edge cases\n\
                - Security considerations\n\
                - Test coverage{}",
                task.title,
                task_id,
                additional_instructions
                    .map(|i| format!("\n\nAdditional instructions:\n{}", i))
                    .unwrap_or_default()
            );

            return TaskServer::success(&RequestPmReviewResponse {
                task_id: task_id.to_string(),
                has_pm_task: false,
                review_prompt: basic_prompt,
                review_checklist: vec![
                    "Code quality and best practices".to_string(),
                    "Potential bugs or edge cases".to_string(),
                    "Security considerations".to_string(),
                    "Test coverage".to_string(),
                ],
            });
        };

        // Fetch the PM task details
        let pm_task_url = self.url(&format!("/api/tasks/{}", pm_task_id));
        let pm_task: Task = match self.send_json(self.client.get(&pm_task_url)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        // Build the review prompt based on PM specs
        let pm_specs = pm_task
            .description
            .unwrap_or_else(|| "No detailed specifications provided.".to_string());

        let review_prompt = format!(
            "## PM-Based Code Review for Task: {}\n\n\
            ### Task Description\n{}\n\n\
            ### Project Specifications (from PM)\n{}\n\n\
            ### Review Instructions\n\
            Please review the implementation and verify:\n\n\
            1. **Specification Compliance**: Does the implementation match the project specifications?\n\
            2. **Requirements Coverage**: Are all requirements from the PM specs addressed?\n\
            3. **Architecture Alignment**: Does the code follow the architectural patterns described in the specs?\n\
            4. **Code Quality**: Is the code maintainable, readable, and follows best practices?\n\
            5. **Edge Cases**: Are edge cases and error scenarios properly handled?\n\
            6. **Test Coverage**: Are there adequate tests for the implementation?\n\
            {}",
            task.title,
            task.description
                .unwrap_or_else(|| "No task description provided.".to_string()),
            pm_specs,
            additional_instructions
                .map(|i| format!("\n### Additional Instructions\n{}", i))
                .unwrap_or_default()
        );

        let review_checklist = vec![
            "Specification compliance with PM docs".to_string(),
            "All requirements addressed".to_string(),
            "Architecture alignment".to_string(),
            "Code quality and best practices".to_string(),
            "Edge cases and error handling".to_string(),
            "Test coverage".to_string(),
        ];

        TaskServer::success(&RequestPmReviewResponse {
            task_id: task_id.to_string(),
            has_pm_task: true,
            review_prompt,
            review_checklist,
        })
    }

    /// Check if two task titles are similar enough to be considered duplicates.
    /// Returns true if titles are duplicates (case-insensitive exact match or containment).
    pub fn is_duplicate_title(new_title: &str, existing_title: &str) -> bool {
        let new_lower = new_title.to_lowercase();
        let existing_lower = existing_title.to_lowercase();
        existing_lower == new_lower
            || existing_lower.contains(&new_lower)
            || new_lower.contains(&existing_lower)
    }

    /// Calculate project progress from task status counts.
    pub fn calculate_progress(total_tasks: i32, completed_tasks: i32) -> f32 {
        if total_tasks > 0 {
            (completed_tasks as f32 / total_tasks as f32) * 100.0
        } else {
            0.0
        }
    }

    #[tool(
        description = "Update the PM (Project Manager) documentation for a project. Use this to save specifications, requirements, architecture notes, or any project documentation. The PM docs are stored as markdown and can be viewed in the PM Docs panel."
    )]
    async fn update_pm_docs(
        &self,
        Parameters(UpdatePmDocsRequest {
            project_id,
            content,
            mode,
        }): Parameters<UpdatePmDocsRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // First, get the current project to check existing docs
        let url = self.url(&format!("/api/projects/{}", project_id));
        let project: Project = match self.send_json(self.client.get(&url)).await {
            Ok(p) => p,
            Err(e) => return Ok(e),
        };

        // Determine new docs based on mode
        let mode_str = mode.as_deref().unwrap_or("append");
        let new_docs = if mode_str == "replace" {
            content
        } else {
            // Append mode
            match project.pm_docs {
                Some(existing) if !existing.is_empty() => format!("{}\n\n{}", existing, content),
                _ => content,
            }
        };

        // Update the project with new PM docs
        let update_url = self.url(&format!("/api/projects/{}/pm-chat/docs", project_id));
        let update_body = serde_json::json!({
            "pm_docs": new_docs
        });

        let response = self
            .client
            .put(&update_url)
            .json(&update_body)
            .send()
            .await;

        match response {
            Ok(resp) if resp.status().is_success() => {
                TaskServer::success(&UpdatePmDocsResponse {
                    project_id: project_id.to_string(),
                    success: true,
                    pm_docs: Some(new_docs),
                })
            }
            Ok(resp) => {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                Ok(CallToolResult::error(vec![Content::text(format!(
                    "Failed to update PM docs: {} - {}",
                    status, body
                ))]))
            }
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Failed to update PM docs: {}",
                e
            ))])),
        }
    }
}

#[tool_handler]
impl ServerHandler for TaskServer {
    fn get_info(&self) -> ServerInfo {
        let mut instruction = "A task and project management server with PM (Project Manager) capabilities. TOOLS: 'list_projects', 'list_tasks', 'create_task', 'get_project_progress', 'start_workspace_session', 'get_task', 'update_task', 'delete_task', 'list_repos', 'get_repo', 'update_setup_script', 'update_cleanup_script', 'update_dev_server_script', 'get_pm_context', 'request_pm_review', 'update_pm_docs'. PM FEATURES: Use 'create_task' with check_duplicate=true to avoid creating duplicate tasks. Use 'create_task' with depends_on=[task_ids] to set task dependencies. Use 'get_project_progress' to get completion percentage and task status summary. Use 'get_pm_context' to fetch project specifications before implementing. Use 'request_pm_review' for review checklists. Use 'update_pm_docs' to save structured documentation. Always pass project_id where required.".to_string();
        if self.context.is_some() {
            let context_instruction = "Use 'get_context' to fetch project/task/workspace metadata (including PM context if available) for the active Vibe Kanban workspace session when available.";
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

#[cfg(test)]
mod tests {
    use super::*;

    mod duplicate_detection {
        use super::*;

        #[test]
        fn test_exact_match_is_duplicate() {
            assert!(TaskServer::is_duplicate_title("Add login feature", "Add login feature"));
        }

        #[test]
        fn test_case_insensitive_match_is_duplicate() {
            assert!(TaskServer::is_duplicate_title("Add Login Feature", "add login feature"));
            assert!(TaskServer::is_duplicate_title("ADD LOGIN FEATURE", "add login feature"));
        }

        #[test]
        fn test_new_title_contained_in_existing_is_duplicate() {
            assert!(TaskServer::is_duplicate_title("login", "Add login feature"));
            assert!(TaskServer::is_duplicate_title("Login", "add login feature"));
        }

        #[test]
        fn test_existing_title_contained_in_new_is_duplicate() {
            assert!(TaskServer::is_duplicate_title("Add login feature with OAuth", "login feature"));
        }

        #[test]
        fn test_completely_different_titles_not_duplicate() {
            assert!(!TaskServer::is_duplicate_title("Add login feature", "Fix payment bug"));
            assert!(!TaskServer::is_duplicate_title("User authentication", "Database migration"));
        }

        #[test]
        fn test_partial_word_match_is_duplicate() {
            // "auth" is contained in "authentication"
            assert!(TaskServer::is_duplicate_title("auth", "User authentication"));
        }

        #[test]
        fn test_empty_titles() {
            assert!(TaskServer::is_duplicate_title("", ""));
            // Empty string is contained in any string
            assert!(TaskServer::is_duplicate_title("", "Some task"));
            assert!(TaskServer::is_duplicate_title("Some task", ""));
        }
    }

    mod progress_calculation {
        use super::*;

        #[test]
        fn test_zero_tasks_returns_zero_percent() {
            assert_eq!(TaskServer::calculate_progress(0, 0), 0.0);
        }

        #[test]
        fn test_no_completed_tasks_returns_zero_percent() {
            assert_eq!(TaskServer::calculate_progress(10, 0), 0.0);
        }

        #[test]
        fn test_all_tasks_completed_returns_100_percent() {
            assert_eq!(TaskServer::calculate_progress(10, 10), 100.0);
            assert_eq!(TaskServer::calculate_progress(1, 1), 100.0);
        }

        #[test]
        fn test_partial_completion() {
            assert_eq!(TaskServer::calculate_progress(10, 5), 50.0);
            assert_eq!(TaskServer::calculate_progress(4, 1), 25.0);
            // Use approximate comparison for floating point
            let progress = TaskServer::calculate_progress(3, 1);
            assert!((progress - 33.333333).abs() < 0.001, "Expected ~33.33, got {}", progress);
        }

        #[test]
        fn test_single_task_completed() {
            assert_eq!(TaskServer::calculate_progress(5, 1), 20.0);
        }
    }
}
