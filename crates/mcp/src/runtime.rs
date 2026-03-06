use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    port_file::read_port_file,
    sentry::{self as sentry_utils, SentrySource, sentry_layer},
};
use uuid::Uuid;

const MODE_ENV: &str = "VIBE_MCP_MODE";
const WORKSPACE_ID_ENV: &str = "VIBE_MCP_WORKSPACE_ID";
const SESSION_ID_ENV: &str = "VIBE_MCP_SESSION_ID";
const BACKEND_URL_ENV: &str = "VIBE_MCP_BACKEND_URL";
const HOST_ENV: &str = "VIBE_MCP_HOST";
const PORT_ENV: &str = "VIBE_MCP_PORT";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpLaunchMode {
    Global,
    Workspace,
}

#[derive(Debug, Clone)]
pub struct LaunchConfig {
    pub mode: McpLaunchMode,
    pub workspace_id: Option<Uuid>,
    pub session_id: Option<Uuid>,
}

pub fn resolve_launch_config() -> anyhow::Result<LaunchConfig> {
    let mut args = std::env::args().skip(1);
    let mut mode = std::env::var(MODE_ENV).ok();
    let mut workspace_id = std::env::var(WORKSPACE_ID_ENV).ok();
    let mut session_id = std::env::var(SESSION_ID_ENV).ok();

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--mode" => {
                mode = Some(args.next().ok_or_else(|| {
                    anyhow::anyhow!("Missing value for --mode. Expected 'global' or 'workspace'")
                })?);
            }
            "--workspace-id" => {
                workspace_id = Some(args.next().ok_or_else(|| {
                    anyhow::anyhow!("Missing value for --workspace-id. Expected a UUID")
                })?);
            }
            "--session-id" => {
                session_id = Some(args.next().ok_or_else(|| {
                    anyhow::anyhow!("Missing value for --session-id. Expected a UUID")
                })?);
            }
            "-h" | "--help" => {
                println!(
                    "Usage: vibe-kanban-mcp --mode <global|workspace> [--workspace-id <UUID>] [--session-id <UUID>]"
                );
                std::process::exit(0);
            }
            _ => {
                return Err(anyhow::anyhow!(
                    "Unknown argument '{arg}'. Usage: vibe-kanban-mcp --mode <global|workspace> [--workspace-id <UUID>] [--session-id <UUID>]"
                ));
            }
        }
    }

    let mode = match mode
        .as_deref()
        .unwrap_or("global")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "global" => McpLaunchMode::Global,
        "workspace" => McpLaunchMode::Workspace,
        value => {
            return Err(anyhow::anyhow!(
                "Invalid MCP mode '{value}'. Expected 'global' or 'workspace'"
            ));
        }
    };

    let workspace_id = workspace_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(parse_uuid_arg)
        .transpose()?;
    let session_id = session_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(parse_uuid_arg)
        .transpose()?;

    Ok(LaunchConfig {
        mode,
        workspace_id,
        session_id,
    })
}

fn parse_uuid_arg(value: &str) -> anyhow::Result<Uuid> {
    Uuid::parse_str(value).map_err(|error| anyhow::anyhow!("Invalid UUID '{value}': {error}"))
}

pub async fn resolve_base_url(log_prefix: &str) -> anyhow::Result<String> {
    if let Ok(url) = std::env::var(BACKEND_URL_ENV) {
        tracing::info!(
            "[{}] Using backend URL from {}: {}",
            log_prefix,
            BACKEND_URL_ENV,
            url
        );
        return Ok(url);
    }

    let host = std::env::var(HOST_ENV)
        .or_else(|_| std::env::var("HOST"))
        .unwrap_or_else(|_| "127.0.0.1".to_string());

    let port = match std::env::var(PORT_ENV)
        .or_else(|_| std::env::var("BACKEND_PORT"))
        .or_else(|_| std::env::var("PORT"))
    {
        Ok(port_str) => {
            tracing::info!("[{}] Using port from environment: {}", log_prefix, port_str);
            port_str
                .parse::<u16>()
                .map_err(|error| anyhow::anyhow!("Invalid port value '{}': {}", port_str, error))?
        }
        Err(_) => {
            let port = read_port_file("vibe-kanban").await?;
            tracing::info!("[{}] Using port from port file: {}", log_prefix, port);
            port
        }
    };

    let url = format!("http://{}:{}", host, port);
    tracing::info!("[{}] Using backend URL: {}", log_prefix, url);
    Ok(url)
}

pub fn init_process_logging(log_prefix: &str, version: &str) {
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    sentry_utils::init_once(SentrySource::Mcp);

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(std::io::stderr)
                .with_filter(EnvFilter::new("debug")),
        )
        .with(sentry_layer())
        .init();

    tracing::debug!(
        "[{}] Starting Vibe Kanban MCP server version {}...",
        log_prefix,
        version
    );
}
