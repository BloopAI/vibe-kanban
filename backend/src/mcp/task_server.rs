use rmcp::{
    model::{
        CallToolResult, Content, Implementation, ProtocolVersion, ServerCapabilities, ServerInfo,
    },
    schemars, tool, Error as RmcpError, ServerHandler,
};
use serde::{Deserialize, Serialize};
use serde_json;
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::models::{
    project::Project,
    task::{CreateTask, Task},
};

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateTaskRequest {
    #[schemars(description = "The ID of the project to create the task in")]
    pub project_id: String,
    #[schemars(description = "The title of the task")]
    pub title: String,
    #[schemars(description = "Optional description of the task")]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListProjectsRequest {
    // Empty for now, but we can add filtering options later
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct CreateTaskResponse {
    pub success: bool,
    pub task_id: String,
    pub message: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ProjectSummary {
    #[schemars(description = "The unique identifier of the project")]
    pub id: String,
    #[schemars(description = "The name of the project")]
    pub name: String,
    #[schemars(description = "The path to the git repository")]
    pub git_repo_path: String,
    #[schemars(description = "Optional setup script for the project")]
    pub setup_script: Option<String>,
    #[schemars(description = "Optional development script for the project")]
    pub dev_script: Option<String>,
    #[schemars(description = "Current git branch (if available)")]
    pub current_branch: Option<String>,
    #[schemars(description = "When the project was created")]
    pub created_at: String,
    #[schemars(description = "When the project was last updated")]
    pub updated_at: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ListProjectsResponse {
    pub success: bool,
    pub projects: Vec<ProjectSummary>,
    pub count: usize,
}

#[derive(Debug, Clone)]
pub struct TaskServer {
    pub pool: SqlitePool,
}

impl TaskServer {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[tool(tool_box)]
impl TaskServer {
    #[tool(description = "Create a new task in a project")]
    async fn create_task(
        &self,
        #[tool(aggr)] CreateTaskRequest { project_id, title, description }: CreateTaskRequest,
    ) -> Result<CallToolResult, RmcpError> {
        // Parse project_id from string to UUID
        let project_uuid = match Uuid::parse_str(&project_id) {
            Ok(uuid) => uuid,
            Err(_) => {
                let error_response = serde_json::json!({
                    "success": false,
                    "error": "Invalid project ID format. Must be a valid UUID.",
                    "project_id": project_id
                });
                return Ok(CallToolResult::error(vec![Content::text(
                    serde_json::to_string_pretty(&error_response).unwrap_or_else(|_| "Invalid project ID format".to_string())
                )]));
            }
        };

        // Check if project exists
        match Project::exists(&self.pool, project_uuid).await {
            Ok(false) => {
                let error_response = serde_json::json!({
                    "success": false,
                    "error": "Project not found",
                    "project_id": project_id
                });
                return Ok(CallToolResult::error(vec![Content::text(
                    serde_json::to_string_pretty(&error_response).unwrap_or_else(|_| "Project not found".to_string())
                )]));
            }
            Err(e) => {
                let error_response = serde_json::json!({
                    "success": false,
                    "error": "Failed to check project existence",
                    "details": e.to_string(),
                    "project_id": project_id
                });
                return Ok(CallToolResult::error(vec![Content::text(
                    serde_json::to_string_pretty(&error_response).unwrap_or_else(|_| "Database error".to_string())
                )]));
            }
            Ok(true) => {}
        }

        let task_id = Uuid::new_v4();
        let create_task_data = CreateTask {
            project_id: project_uuid,
            title: title.clone(),
            description: description.clone(),
        };

        match Task::create(&self.pool, &create_task_data, task_id).await {
            Ok(_task) => {
                let success_response = CreateTaskResponse {
                    success: true,
                    task_id: task_id.to_string(),
                    message: "Task created successfully".to_string(),
                };
                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&success_response).unwrap_or_else(|_| "Task created successfully".to_string())
                )]))
            }
            Err(e) => {
                let error_response = serde_json::json!({
                    "success": false,
                    "error": "Failed to create task",
                    "details": e.to_string(),
                    "project_id": project_id,
                    "title": title
                });
                Ok(CallToolResult::error(vec![Content::text(
                    serde_json::to_string_pretty(&error_response).unwrap_or_else(|_| "Failed to create task".to_string())
                )]))
            }
        }
    }

    #[tool(description = "List all available projects")]
    async fn list_projects(
        &self,
        #[tool(aggr)] _request: ListProjectsRequest,
    ) -> Result<CallToolResult, RmcpError> {
        match Project::find_all(&self.pool).await {
            Ok(projects) => {
                let count = projects.len();
                let project_summaries: Vec<ProjectSummary> = projects
                    .into_iter()
                    .map(|project| {
                        let project_with_branch = project.with_branch_info();
                        ProjectSummary {
                            id: project_with_branch.id.to_string(),
                            name: project_with_branch.name,
                            git_repo_path: project_with_branch.git_repo_path,
                            setup_script: project_with_branch.setup_script,
                            dev_script: project_with_branch.dev_script,
                            current_branch: project_with_branch.current_branch,
                            created_at: project_with_branch.created_at.to_rfc3339(),
                            updated_at: project_with_branch.updated_at.to_rfc3339(),
                        }
                    })
                    .collect();

                let response = ListProjectsResponse {
                    success: true,
                    projects: project_summaries,
                    count,
                };

                Ok(CallToolResult::success(vec![Content::text(
                    serde_json::to_string_pretty(&response).unwrap_or_else(|_| "Failed to serialize projects".to_string())
                )]))
            }
            Err(e) => {
                let error_response = serde_json::json!({
                    "success": false,
                    "error": "Failed to retrieve projects",
                    "details": e.to_string()
                });
                Ok(CallToolResult::error(vec![Content::text(
                    serde_json::to_string_pretty(&error_response).unwrap_or_else(|_| "Database error".to_string())
                )]))
            }
        }
    }
}

#[tool(tool_box)]
impl ServerHandler for TaskServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::V_2024_11_05,
            capabilities: ServerCapabilities::builder()
                .enable_tools()
                .build(),
            server_info: Implementation {
                name: "task-manager".to_string(),
                version: "1.0.0".to_string(),
            },
            instructions: Some("A task management server that allows autonomous creation and management of tasks across multiple projects. All responses are in JSON format. Use 'list_projects' to see available projects, then use 'create_task' with a specific project_id.".to_string()),
        }
    }
}