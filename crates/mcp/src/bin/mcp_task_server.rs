use mcp::{runtime, task_server::McpServer};
use rmcp::{ServiceExt, transport::stdio};

fn main() -> anyhow::Result<()> {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async {
            let version = env!("CARGO_PKG_VERSION");
            runtime::init_process_logging("mcp-global", version);
            let base_url = runtime::resolve_base_url("mcp-global").await?;

            let service = McpServer::new_global(&base_url)
                .init()
                .await
                .serve(stdio())
                .await
                .map_err(|e| {
                    tracing::error!("serving error: {:?}", e);
                    e
                })?;

            service.waiting().await?;
            Ok(())
        })
}
