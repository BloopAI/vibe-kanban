use rmcp::{
    ServerHandler,
    model::{Implementation, ProtocolVersion, ServerCapabilities, ServerInfo},
    tool_handler,
};

use super::WorkspaceServer;

#[tool_handler]
impl ServerHandler for WorkspaceServer {
    fn get_info(&self) -> ServerInfo {
        let instruction = format!(
            "A workspace-scoped session management server for workspace {}. \
             TOOLS: 'create_session', 'list_sessions', 'rename_workspace', 'output_markdown_to_user', 'run_coding_agent_in_session', 'get_execution_status'.",
            self.workspace_id
        );

        ServerInfo {
            protocol_version: ProtocolVersion::V_2025_03_26,
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            server_info: Implementation {
                name: "workspace-mcp".to_string(),
                version: "1.0.0".to_string(),
            },
            instructions: Some(instruction),
        }
    }
}
