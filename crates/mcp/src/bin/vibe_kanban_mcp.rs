use mcp::{
    runtime::{self, LaunchConfig, McpLaunchMode},
    task_server::McpServer,
};
use rmcp::{ServiceExt, transport::stdio};

fn main() -> anyhow::Result<()> {
    let launch_config = runtime::resolve_launch_config()?;

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async move {
            let version = env!("CARGO_PKG_VERSION");
            runtime::init_process_logging("vibe-kanban-mcp", version);

            let base_url = runtime::resolve_base_url("vibe-kanban-mcp").await?;
            let LaunchConfig {
                mode,
                workspace_id,
                session_id,
            } = launch_config;

            let server = match mode {
                McpLaunchMode::Global => McpServer::new_global(&base_url),
                McpLaunchMode::Workspace => McpServer::new_workspace(
                    &base_url,
                    workspace_id.ok_or_else(|| {
                        anyhow::anyhow!(
                            "workspace mode requires --workspace-id or VIBE_MCP_WORKSPACE_ID"
                        )
                    })?,
                    session_id,
                ),
            };

            let service = server.init().await.serve(stdio()).await.map_err(|error| {
                tracing::error!("serving error: {:?}", error);
                error
            })?;

            service.waiting().await?;
            Ok(())
        })
}
