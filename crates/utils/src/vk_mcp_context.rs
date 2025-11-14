use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Environment variable used to propagate VK MCP context to child processes.
pub const VK_MCP_CONTEXT_ENV: &str = "VK_MCP_CONTEXT_JSON";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VkMcpContext {
    pub project_id: Uuid,
    pub task_id: Uuid,
    pub task_title: String,
    pub attempt_id: Uuid,
    pub attempt_branch: String,
    pub attempt_target_branch: String,
    pub execution_process_id: Uuid,
    pub executor: String,
}
