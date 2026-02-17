use std::str::FromStr;

use db::models::{
    project::Project,
    task::{CreateTask, TaskWithAttemptStatus},
    workspace::Workspace,
};
use executors::{executors::BaseCodingAgent, profile::ExecutorConfig};
use rmcp::{
    ErrorData, handler::server::tool::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::TaskServer;
use crate::routes::{task_attempts::WorkspaceRepoInput, tasks::CreateAndStartTaskRequest};

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpWorkspaceRepoInput {
    #[schemars(description = "The repository ID")]
    repo_id: Uuid,
    #[schemars(description = "The base branch for this repository")]
    base_branch: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct StartWorkspaceSessionRequest {
    #[schemars(description = "A title for the workspace (used as the task name)")]
    title: String,
    #[schemars(
        description = "The coding agent executor to run ('CLAUDE_CODE', 'AMP', 'GEMINI', 'CODEX', 'OPENCODE', 'CURSOR_AGENT', 'QWEN_CODE', 'COPILOT', 'DROID')"
    )]
    executor: String,
    #[schemars(description = "Optional executor variant, if needed")]
    variant: Option<String>,
    #[schemars(description = "Base branch for each repository in the project")]
    repos: Vec<McpWorkspaceRepoInput>,
    #[schemars(
        description = "Optional issue ID to link the workspace to. When provided, the workspace will be associated with this remote issue."
    )]
    issue_id: Option<Uuid>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct StartWorkspaceSessionResponse {
    workspace_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpLinkWorkspaceRequest {
    #[schemars(description = "The workspace ID to link")]
    workspace_id: Uuid,
    #[schemars(description = "The issue ID to link the workspace to")]
    issue_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct McpLinkWorkspaceResponse {
    #[schemars(description = "Whether the linking was successful")]
    success: bool,
    #[schemars(description = "The workspace ID that was linked")]
    workspace_id: String,
    #[schemars(description = "The issue ID it was linked to")]
    issue_id: String,
}

#[tool_router(router = task_attempts_tools_router, vis = "pub")]
impl TaskServer {
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

        let mut executor_config = ExecutorConfig::new(base_executor);
        executor_config.variant = variant;

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
            executor_config,
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
}
