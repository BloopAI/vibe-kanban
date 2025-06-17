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
    pub project_id: Uuid,
}

impl TaskServer {
    pub fn new(pool: SqlitePool, project_id: Uuid) -> Self {
        Self { pool, project_id }
    }
}

#[tool(tool_box)]
impl TaskServer {
    #[tool(description = "Create a new task in a project")]
    async fn create_task(
        &self,
        #[tool(aggr)] CreateTaskRequest { title, description }: CreateTaskRequest,
    ) -> Result<CallToolResult, RmcpError> {
        match Project::exists(&self.pool, self.project_id).await {
            Ok(false) => {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Project not found".to_string(),
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
            project_id: self.project_id,
            title,
            description,
        };

        match Task::create(&self.pool, &create_task_data, task_id).await {
            Ok(task) => Ok(CallToolResult::success(vec![Content::text(
                task.id.to_string(),
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
            instructions: Some("A task management server that allows autonomous creation and management of tasks in projects".to_string()),
        }
    }
}
