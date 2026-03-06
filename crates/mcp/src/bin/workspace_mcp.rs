use mcp::{runtime, task_server::McpServer};
use rmcp::{ServiceExt, transport::stdio};
use uuid::Uuid;

const ATTACHED_SESSION_ID_ENV: &str = "VK_SESSION_ID";

fn parse_workspace_id_arg() -> anyhow::Result<Uuid> {
    let mut args = std::env::args().skip(1);
    let mut workspace_id: Option<String> = None;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--workspace-id" => {
                let value = args.next().ok_or_else(|| {
                    anyhow::anyhow!(
                        "Missing value for --workspace-id. Expected: --workspace-id <UUID>"
                    )
                })?;
                workspace_id = Some(value);
            }
            "-h" | "--help" => {
                println!("Usage: workspace-mcp --workspace-id <UUID>");
                std::process::exit(0);
            }
            _ => {
                return Err(anyhow::anyhow!(
                    "Unknown argument '{arg}'. Usage: workspace-mcp --workspace-id <UUID>"
                ));
            }
        }
    }

    let workspace_id = workspace_id
        .ok_or_else(|| anyhow::anyhow!("Missing required argument: --workspace-id <UUID>"))?;

    Uuid::parse_str(&workspace_id)
        .map_err(|error| anyhow::anyhow!("Invalid workspace_id '{workspace_id}': {error}"))
}

fn resolve_attached_session_id() -> Option<Uuid> {
    let session_id = std::env::var(ATTACHED_SESSION_ID_ENV).ok()?;
    let session_id = session_id.trim();
    if session_id.is_empty() {
        return None;
    }

    match Uuid::parse_str(session_id) {
        Ok(parsed) => {
            tracing::info!(
                "[workspace-mcp] Attached to VK session from {}: {}",
                ATTACHED_SESSION_ID_ENV,
                parsed
            );
            Some(parsed)
        }
        Err(error) => {
            tracing::warn!(
                "[workspace-mcp] Ignoring invalid {} '{}': {}",
                ATTACHED_SESSION_ID_ENV,
                session_id,
                error
            );
            None
        }
    }
}

fn main() -> anyhow::Result<()> {
    let workspace_id = parse_workspace_id_arg()?;

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async {
            let version = env!("CARGO_PKG_VERSION");
            runtime::init_process_logging("workspace-mcp", version);
            tracing::debug!("[workspace-mcp] Scoped workspace_id={}", workspace_id);

            let base_url = runtime::resolve_base_url("workspace-mcp").await?;
            let attached_session_id = resolve_attached_session_id();

            let service = McpServer::new_workspace(&base_url, workspace_id, attached_session_id)
                .init()
                .await
                .serve(stdio())
                .await
                .map_err(|error| {
                    tracing::error!("serving error: {:?}", error);
                    error
                })?;

            service.waiting().await?;
            Ok(())
        })
}
