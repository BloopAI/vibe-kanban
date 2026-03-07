use db::models::session::Session;
use mcp::{ApiResponseEnvelope, task_server::McpServer};
use rmcp::{ServiceExt, transport::stdio};
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    port_file::read_port_file,
    sentry::{self as sentry_utils, SentrySource, sentry_layer},
};
use uuid::Uuid;

const HOST_ENV: &str = "MCP_HOST";
const PORT_ENV: &str = "MCP_PORT";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum McpLaunchMode {
    Global,
    Orchestrator,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LaunchConfig {
    mode: McpLaunchMode,
    session_id: Option<Uuid>,
}

fn main() -> anyhow::Result<()> {
    let launch_config = resolve_launch_config()?;

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async move {
            let version = env!("CARGO_PKG_VERSION");
            init_process_logging("vibe-kanban-mcp", version);

            let base_url = resolve_base_url("vibe-kanban-mcp").await?;
            let LaunchConfig { mode, session_id } = launch_config;

            let server = match mode {
                McpLaunchMode::Global => McpServer::new_global(&base_url),
                McpLaunchMode::Orchestrator => {
                    let session_id = session_id.ok_or_else(|| {
                        anyhow::anyhow!("orchestrator mode requires --session-id")
                    })?;
                    let session = resolve_session(&base_url, session_id).await?;
                    McpServer::new_orchestrator(&base_url, session)
                }
            };

            let service = server.init().await.serve(stdio()).await.map_err(|error| {
                tracing::error!("serving error: {:?}", error);
                error
            })?;

            service.waiting().await?;
            Ok(())
        })
}

fn resolve_launch_config() -> anyhow::Result<LaunchConfig> {
    let mut args = std::env::args().skip(1);
    let mut mode = None;
    let mut session_id = None;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--mode" => {
                mode = Some(args.next().ok_or_else(|| {
                    anyhow::anyhow!("Missing value for --mode. Expected 'global' or 'orchestrator'")
                })?);
            }
            "--session-id" => {
                session_id = Some(args.next().ok_or_else(|| {
                    anyhow::anyhow!("Missing value for --session-id. Expected a UUID")
                })?);
            }
            "-h" | "--help" => {
                println!(
                    "Usage: vibe-kanban-mcp --mode <global|orchestrator> [--session-id <UUID>]"
                );
                std::process::exit(0);
            }
            _ => {
                return Err(anyhow::anyhow!(
                    "Unknown argument '{arg}'. Usage: vibe-kanban-mcp --mode <global|orchestrator> [--session-id <UUID>]"
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
        "orchestrator" => McpLaunchMode::Orchestrator,
        value => {
            return Err(anyhow::anyhow!(
                "Invalid MCP mode '{value}'. Expected 'global' or 'orchestrator'"
            ));
        }
    };

    let session_id = session_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(parse_uuid_arg)
        .transpose()?;

    Ok(LaunchConfig { mode, session_id })
}

fn parse_uuid_arg(value: &str) -> anyhow::Result<Uuid> {
    Uuid::parse_str(value).map_err(|error| anyhow::anyhow!("Invalid UUID '{value}': {error}"))
}

async fn resolve_base_url(log_prefix: &str) -> anyhow::Result<String> {
    if let Ok(url) = std::env::var("VIBE_BACKEND_URL") {
        tracing::info!(
            "[{}] Using backend URL from VIBE_BACKEND_URL: {}",
            log_prefix,
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

async fn resolve_session(base_url: &str, session_id: Uuid) -> anyhow::Result<Session> {
    let url = format!(
        "{}/api/sessions/{}",
        base_url.trim_end_matches('/'),
        session_id
    );
    let response = reqwest::Client::new().get(&url).send().await?;

    if !response.status().is_success() {
        return Err(anyhow::anyhow!(
            "Failed to resolve session {}: backend returned {}",
            session_id,
            response.status()
        ));
    }

    let api_response = response.json::<ApiResponseEnvelope<Session>>().await?;
    if !api_response.success {
        let message = api_response
            .message
            .unwrap_or_else(|| "Unknown error".to_string());
        return Err(anyhow::anyhow!(
            "Failed to resolve session {}: {}",
            session_id,
            message
        ));
    }

    api_response.data.ok_or_else(|| {
        anyhow::anyhow!(
            "Failed to resolve session {}: response missing session data",
            session_id
        )
    })
}

fn init_process_logging(log_prefix: &str, version: &str) {
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
