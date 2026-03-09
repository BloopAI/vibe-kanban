use rmcp::{ErrorData, model::CallToolResult, tool, tool_router};

use super::McpServer;

#[tool_router(router = context_tools_router, vis = "pub")]
impl McpServer {
    #[tool(
        description = "Return project, issue, workspace, and orchestrator-session metadata for the current MCP context."
    )]
    async fn get_context(&self) -> Result<CallToolResult, ErrorData> {
        let context = self.context.as_ref().expect("VK context should exist");
        McpServer::success(context)
    }
}
