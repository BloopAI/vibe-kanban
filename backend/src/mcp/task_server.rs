use rmcp::{
    model::{
        CallToolResult, Content, Implementation, ProtocolVersion, ServerCapabilities, ServerInfo,
    },
    schemars, tool, Error as RmcpError, ServerHandler,
};
use serde::{Deserialize, Serialize};
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

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct CreateTaskResponse {
    pub success: bool,
    pub task_id: Option<String>,
    pub message: String,
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
        let project_uuid = match Uuid::parse_str(&project_id) {
            Ok(uuid) => uuid,
            Err(e) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    format!("Invalid project ID format: {project_id}. Must be a valid UUID: {e:?}"),
                )]));
            }
        };

        // Check if project exists
        match Project::exists(&self.pool, project_uuid).await {
            Ok(false) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    format!("Project with ID {} not found", project_id),
                )]));
            }
            Err(e) => {
                return Ok(CallToolResult::error(vec![Content::text(format!(
                    "Failed to check project existence: {}",
                    e
                ))]));
            }
            Ok(true) => {}
        }

        let task_id = Uuid::new_v4();
        let create_task_data = CreateTask {
            project_id: project_uuid,
            title,
            description,
        };

        match Task::create(&self.pool, &create_task_data, task_id).await {
            Ok(task) => Ok(CallToolResult::success(vec![Content::text(
                format!("Task created successfully with ID: {}", task.id),
            )])),
            Err(e) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Failed to create task: {}",
                e
            ))])),
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
            instructions: Some("A task management server that allows autonomous creation and management of tasks across multiple projects. Each request requires a project_id parameter.".to_string()),
        }
    }
}