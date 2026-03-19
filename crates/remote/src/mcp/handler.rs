use rmcp::{
    ServerHandler,
    handler::server::tool::ToolRouter,
    model::{Implementation, ProtocolVersion, ServerCapabilities, ServerInfo},
    tool_handler,
};
use sqlx::PgPool;

#[derive(Debug, Clone)]
pub struct RemoteMcpServer {
    pool: PgPool,
    tool_router: ToolRouter<RemoteMcpServer>,
}

impl RemoteMcpServer {
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool: pool.clone(),
            tool_router: Self::build_router(),
        }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }
}

#[tool_handler]
impl ServerHandler for RemoteMcpServer {
    fn get_info(&self) -> ServerInfo {
        let mut tool_names = self
            .tool_router
            .list_all()
            .into_iter()
            .map(|tool| format!("'{}'", tool.name))
            .collect::<Vec<_>>();
        tool_names.sort();

        let instruction = format!(
            "A remote Vibe Kanban MCP server for querying organizations, projects, and issues. \
             Use list/read tools first when you need IDs or current state. TOOLS: {}.",
            tool_names.join(", ")
        );

        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("vibe-kanban-remote-mcp", "1.0.0"))
            .with_protocol_version(ProtocolVersion::V_2025_06_18)
            .with_instructions(instruction)
    }
}
