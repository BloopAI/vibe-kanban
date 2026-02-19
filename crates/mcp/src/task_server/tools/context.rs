use rmcp::{ErrorData, model::CallToolResult, tool, tool_router};

use super::TaskServer;

#[tool_router(router = context_tools_router, vis = "pub")]
impl TaskServer {
    #[tool(
        description = "Return project, issue, and workspace metadata for the current workspace session context."
    )]
    async fn get_context(&self) -> Result<CallToolResult, ErrorData> {
        let context = self.context.as_ref().expect("VK context should exist");
        TaskServer::success(context)
    }
}
