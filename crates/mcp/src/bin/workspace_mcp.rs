use mcp::workspace_server::WorkspaceServer;
use rmcp::{ServiceExt, transport::stdio};
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    port_file::read_port_file,
    sentry::{self as sentry_utils, SentrySource, sentry_layer},
};
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

async fn resolve_base_url() -> anyhow::Result<String> {
    if let Ok(url) = std::env::var("VIBE_BACKEND_URL") {
        tracing::info!(
            "[workspace-mcp] Using backend URL from VIBE_BACKEND_URL: {}",
            url
        );
        return Ok(url);
    }

    let host = std::env::var("MCP_HOST")
        .or_else(|_| std::env::var("HOST"))
        .unwrap_or_else(|_| "127.0.0.1".to_string());

    let port = match std::env::var("MCP_PORT")
        .or_else(|_| std::env::var("BACKEND_PORT"))
        .or_else(|_| std::env::var("PORT"))
    {
        Ok(port_str) => {
            tracing::info!("[workspace-mcp] Using port from environment: {}", port_str);
            port_str
                .parse::<u16>()
                .map_err(|error| anyhow::anyhow!("Invalid port value '{}': {}", port_str, error))?
        }
        Err(_) => {
            let port = read_port_file("vibe-kanban").await?;
            tracing::info!("[workspace-mcp] Using port from port file: {}", port);
            port
        }
    };

    let url = format!("http://{}:{}", host, port);
    tracing::info!("[workspace-mcp] Using backend URL: {}", url);
    Ok(url)
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
    // Install rustls crypto provider before any TLS operations
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    let workspace_id = parse_workspace_id_arg()?;

    sentry_utils::init_once(SentrySource::Mcp);
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async {
            tracing_subscriber::registry()
                .with(
                    tracing_subscriber::fmt::layer()
                        .with_writer(std::io::stderr)
                        .with_filter(EnvFilter::new("debug")),
                )
                .with(sentry_layer())
                .init();

            let version = env!("CARGO_PKG_VERSION");
            tracing::debug!(
                "[workspace-mcp] Starting workspace MCP server version {} for workspace {}...",
                version,
                workspace_id
            );

            let base_url = resolve_base_url().await?;
            let attached_session_id = resolve_attached_session_id();

            let service = WorkspaceServer::new(&base_url, workspace_id, attached_session_id)
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
