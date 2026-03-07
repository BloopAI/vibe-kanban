use db::models::session::Session;
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    port_file::read_port_file,
    sentry::{self as sentry_utils, SentrySource, sentry_layer},
};
use uuid::Uuid;

use crate::ApiResponseEnvelope;

const HOST_ENV: &str = "MCP_HOST";
const PORT_ENV: &str = "MCP_PORT";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpLaunchMode {
    Global,
    Orchestrator,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchConfig {
    pub mode: McpLaunchMode,
    pub session_id: Option<Uuid>,
}

pub fn resolve_launch_config() -> anyhow::Result<LaunchConfig> {
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

pub async fn resolve_base_url(log_prefix: &str) -> anyhow::Result<String> {
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

pub async fn resolve_session(base_url: &str, session_id: Uuid) -> anyhow::Result<Session> {
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
