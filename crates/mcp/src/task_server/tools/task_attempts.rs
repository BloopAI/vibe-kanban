use db::models::requests::{
    CreateAndStartWorkspaceRequest, CreateAndStartWorkspaceResponse, LinkedIssueInfo,
    StartTaskRequest, StartTaskResponse, StartTaskTaskSpec, StartTaskWorkspaceSpec,
    WorkspaceRepoInput,
};
use executors::profile::ExecutorConfig;
use rmcp::{
    ErrorData, handler::server::wrapper::Parameters, model::CallToolResult, schemars, tool,
    tool_router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{McpServer, ToolError};

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct McpWorkspaceRepoInput {
    #[schemars(description = "The repository ID")]
    repo_id: Uuid,
    #[schemars(description = "The branch for this repository")]
    branch: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct StartWorkspaceRequest {
    #[schemars(description = "Name for the workspace")]
    name: String,
    #[schemars(
        description = "Optional prompt for the first workspace session. If omitted/empty, the linked issue title/description is used."
    )]
    prompt: Option<String>,
    #[schemars(
        description = "The coding agent executor to run ('CLAUDE_CODE', 'AMP', 'GEMINI', 'CODEX', 'OPENCODE', 'CURSOR_AGENT', 'QWEN_CODE', 'COPILOT', 'DROID')"
    )]
    executor: String,
    #[schemars(description = "Optional executor variant, if needed")]
    variant: Option<String>,
    #[schemars(description = "Repository selection for the workspace")]
    repositories: Vec<McpWorkspaceRepoInput>,
    #[schemars(
        description = "Optional issue ID to link the workspace to. When provided, the workspace will be associated with this remote issue."
    )]
    issue_id: Option<Uuid>,
    #[schemars(
        description = "Optional parent workspace ID. When provided, the workspace is created atomically together with a new task via /api/tasks/start (D6) that is nested under the given parent workspace. Must not be combined with `issue_id`. Requires `project_id`."
    )]
    parent_workspace_id: Option<Uuid>,
    #[schemars(
        description = "Project ID for the task row when `parent_workspace_id` is set. Required whenever `parent_workspace_id` is provided."
    )]
    project_id: Option<Uuid>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct StartWorkspaceResponse {
    workspace_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct LinkWorkspaceIssueRequest {
    #[schemars(description = "The workspace ID to link")]
    workspace_id: Uuid,
    #[schemars(description = "The issue ID to link the workspace to")]
    issue_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
struct LinkWorkspaceIssueResponse {
    #[schemars(description = "Whether the linking was successful")]
    success: bool,
    #[schemars(description = "The workspace ID that was linked")]
    workspace_id: String,
    #[schemars(description = "The issue ID it was linked to")]
    issue_id: String,
}

fn build_workspace_prompt_from_issue(issue: &api_types::Issue) -> Option<String> {
    let title = issue.title.trim();
    let description = issue
        .description
        .as_deref()
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .unwrap_or_default();

    if title.is_empty() && description.is_empty() {
        return None;
    }

    if description.is_empty() {
        return Some(title.to_string());
    }

    if title.is_empty() {
        return Some(description.to_string());
    }

    Some(format!("{title}\n\n{description}"))
}

#[tool_router(router = task_attempts_tools_router, vis = "pub")]
impl McpServer {
    #[tool(description = "Create a new workspace and start its first session.")]
    async fn start_workspace(
        &self,
        Parameters(StartWorkspaceRequest {
            name,
            prompt,
            executor,
            variant,
            repositories,
            issue_id,
            parent_workspace_id,
            project_id,
        }): Parameters<StartWorkspaceRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        if repositories.is_empty() {
            return Self::err("At least one repository must be specified.", None::<&str>);
        }

        let executor_trimmed = executor.trim();
        if executor_trimmed.is_empty() {
            return Self::err("Executor must not be empty.", None::<&str>);
        }

        if parent_workspace_id.is_some() && issue_id.is_some() {
            return Ok(Self::tool_error(ToolError::message(
                "parent_workspace_id and issue_id cannot be combined",
            )));
        }

        let prompt = prompt.and_then(|prompt| {
            let trimmed = prompt.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });

        let base_executor = match Self::parse_executor_agent(executor_trimmed) {
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

        let workspace_repos: Vec<WorkspaceRepoInput> = repositories
            .into_iter()
            .map(|r| WorkspaceRepoInput {
                repo_id: r.repo_id,
                target_branch: r.branch,
            })
            .collect();

        // Parent-workspace branch: route through /api/tasks/start (atomic tx).
        if let Some(parent) = parent_workspace_id {
            let workspace_prompt = match prompt {
                Some(prompt) => prompt,
                None => {
                    return Self::err(
                        "`prompt` is required when `parent_workspace_id` is set.",
                        None::<&str>,
                    );
                }
            };
            let project_id = match project_id {
                Some(id) => id,
                None => {
                    return Ok(Self::tool_error(
                        ToolError::message(
                            "`project_id` is required when `parent_workspace_id` is set",
                        )
                        .with_error_kind("missing_project_id"),
                    ));
                }
            };

            let payload = StartTaskRequest {
                task: StartTaskTaskSpec {
                    project_id,
                    title: name.clone(),
                    description: None,
                    parent_workspace_id: Some(parent),
                },
                workspace: StartTaskWorkspaceSpec {
                    name: Some(name),
                    repos: workspace_repos,
                    executor_config: ExecutorConfig {
                        executor: base_executor,
                        variant,
                        model_id: None,
                        agent_id: None,
                        reasoning_id: None,
                        permission_policy: None,
                    },
                    prompt: workspace_prompt,
                },
            };

            let url = self.url("/api/tasks/start");
            let response: StartTaskResponse =
                match self.send_json(self.client.post(&url).json(&payload)).await {
                    Ok(value) => value,
                    Err(e) => return Ok(Self::tool_error(e)),
                };

            return McpServer::success(&StartWorkspaceResponse {
                workspace_id: response.workspace_id.to_string(),
            });
        }

        let (linked_issue, issue_prompt) = if let Some(issue_id) = issue_id {
            let issue_url = self.url(&format!("/api/remote/issues/{issue_id}"));
            let issue: api_types::Issue = match self.send_json(self.client.get(&issue_url)).await {
                Ok(issue) => issue,
                Err(e) => return Ok(Self::tool_error(e)),
            };

            (
                Some(LinkedIssueInfo {
                    remote_project_id: issue.project_id,
                    issue_id,
                }),
                build_workspace_prompt_from_issue(&issue),
            )
        } else {
            (None, None)
        };

        let workspace_prompt = match prompt.or(issue_prompt) {
            Some(prompt) => prompt,
            None => {
                return Self::err(
                    "Provide `prompt`, or `issue_id` that has a non-empty title/description.",
                    None::<&str>,
                );
            }
        };

        let create_and_start_payload = CreateAndStartWorkspaceRequest {
            name: Some(name.clone()),
            repos: workspace_repos,
            linked_issue,
            executor_config: ExecutorConfig {
                executor: base_executor,
                variant,
                model_id: None,
                agent_id: None,
                reasoning_id: None,
                permission_policy: None,
            },
            prompt: workspace_prompt,
            attachment_ids: None,
            adopt_cursor_mcp_lobby_bridge_session_id: None,
        };

        let create_and_start_url = self.url("/api/workspaces/start");
        let create_and_start_response: CreateAndStartWorkspaceResponse = match self
            .send_json(
                self.client
                    .post(&create_and_start_url)
                    .json(&create_and_start_payload),
            )
            .await
        {
            Ok(response) => response,
            Err(e) => return Ok(Self::tool_error(e)),
        };

        // Link workspace to remote issue if issue_id is provided
        if let Some(issue_id) = issue_id
            && let Err(e) = self
                .link_workspace_to_issue(create_and_start_response.workspace.id, issue_id)
                .await
        {
            return Ok(Self::tool_error(e));
        }

        let response = StartWorkspaceResponse {
            workspace_id: create_and_start_response.workspace.id.to_string(),
        };

        McpServer::success(&response)
    }

    #[tool(
        description = "Link an existing workspace to a remote issue. This associates the workspace with the issue for tracking."
    )]
    async fn link_workspace_issue(
        &self,
        Parameters(LinkWorkspaceIssueRequest {
            workspace_id,
            issue_id,
        }): Parameters<LinkWorkspaceIssueRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        if let Err(e) = self.link_workspace_to_issue(workspace_id, issue_id).await {
            return Ok(Self::tool_error(e));
        }

        McpServer::success(&LinkWorkspaceIssueResponse {
            success: true,
            workspace_id: workspace_id.to_string(),
            issue_id: issue_id.to_string(),
        })
    }
}
