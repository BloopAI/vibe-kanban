use std::time::Duration;

use mcp::{cursor_bridge_server::CursorBridgeServer, task_server::McpServer};
use rmcp::{ServiceExt, transport::stdio};
use tokio::io::{AsyncBufReadExt, BufReader};
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    port_file::read_port_file,
    sentry::{self as sentry_utils, SentrySource, sentry_layer},
};

const HOST_ENV: &str = "MCP_HOST";
const PORT_ENV: &str = "MCP_PORT";

#[derive(Debug, Clone, PartialEq, Eq)]
enum McpLaunchMode {
    Global,
    Orchestrator,
    /// stdio bridge that exposes `wait_for_user_input` for the Cursor IDE
    /// Composer Agent. Bound to a single vibe-kanban session UUID supplied
    /// via `--session-id`.
    CursorBridge {
        session_id: uuid::Uuid,
    },
    /// Long-lived no-op process used as the placeholder OS child for a
    /// `CURSOR_MCP` coding-agent session. The vibe-kanban executor framework
    /// requires a real `SpawnedChild`; this mode lives in that role and
    /// exits cleanly when its parent closes stdin or when an `EXIT` line is
    /// written. It does NOT speak MCP and is not meant to be discovered by
    /// any MCP client.
    SessionPlaceholder {
        session_id: uuid::Uuid,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LaunchConfig {
    mode: McpLaunchMode,
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

            let base_url_or_err = match &launch_config.mode {
                // session-placeholder doesn't need to talk to the backend; it
                // runs offline so we don't fail to start when the backend
                // isn't reachable.
                McpLaunchMode::SessionPlaceholder { .. } => Ok(String::new()),
                _ => resolve_base_url("vibe-kanban-mcp").await,
            };

            match launch_config.mode {
                McpLaunchMode::Global => {
                    let base_url = base_url_or_err?;
                    let server = McpServer::new_global(&base_url);
                    let service = server.init().await?.serve(stdio()).await.map_err(|error| {
                        tracing::error!("serving error: {:?}", error);
                        error
                    })?;
                    service.waiting().await?;
                }
                McpLaunchMode::Orchestrator => {
                    let base_url = base_url_or_err?;
                    let server = McpServer::new_orchestrator(&base_url);
                    let service = server.init().await?.serve(stdio()).await.map_err(|error| {
                        tracing::error!("serving error: {:?}", error);
                        error
                    })?;
                    service.waiting().await?;
                }
                McpLaunchMode::CursorBridge { session_id } => {
                    tracing::info!(
                        "Starting Cursor MCP bridge for vibe-kanban session {}",
                        session_id
                    );
                    let base_url = base_url_or_err?;
                    let server = CursorBridgeServer::new(&base_url, session_id);
                    let service = server.serve(stdio()).await.map_err(|error| {
                        tracing::error!("cursor-bridge serving error: {:?}", error);
                        error
                    })?;
                    service.waiting().await?;
                }
                McpLaunchMode::SessionPlaceholder { session_id } => {
                    run_session_placeholder(session_id).await;
                }
            }
            Ok(())
        })
}

async fn run_session_placeholder(session_id: uuid::Uuid) {
    // Print a single readable line so the line shows up in vibe-kanban's
    // raw-logs panel. Cursor IDE separately drives the actual conversation
    // through the cursor-bridge process.
    println!(
        "[vibe-kanban session {}] Cursor MCP placeholder ready. Configure Cursor's mcp.json to point to `vibe-kanban-mcp --mode cursor-bridge --session-id {}` to start the conversation.",
        session_id, session_id
    );

    // Two ways to terminate cleanly:
    // - parent closes our stdin → BufReader sees EOF
    // - parent writes the literal line "EXIT" on stdin
    //
    // The vibe-kanban executor framework otherwise terminates us via
    // `kill_on_drop` when the session is stopped or the workspace tears
    // down.
    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();
    loop {
        match reader.next_line().await {
            Ok(Some(line)) => {
                if line.trim().eq_ignore_ascii_case("EXIT") {
                    break;
                }
            }
            Ok(None) => break,
            Err(_) => {
                // Defensive: if stdin somehow errors, idle until killed
                // rather than busy-loop.
                tokio::time::sleep(Duration::from_secs(60)).await;
            }
        }
    }
}

fn resolve_launch_config() -> anyhow::Result<LaunchConfig> {
    resolve_launch_config_from_iter(std::env::args().skip(1))
}

fn resolve_launch_config_from_iter<I>(mut args: I) -> anyhow::Result<LaunchConfig>
where
    I: Iterator<Item = String>,
{
    let mut mode_arg: Option<String> = None;
    let mut session_id_arg: Option<String> = None;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--mode" => {
                mode_arg = Some(args.next().ok_or_else(|| {
                    anyhow::anyhow!(
                        "Missing value for --mode. Expected 'global', 'orchestrator', 'cursor-bridge', or 'session-placeholder'"
                    )
                })?);
            }
            "--session-id" => {
                session_id_arg = Some(args.next().ok_or_else(|| {
                    anyhow::anyhow!(
                        "Missing value for --session-id. Expected a vibe-kanban session UUID"
                    )
                })?);
            }
            "-h" | "--help" => {
                println!(
                    "Usage:\n  \
                     vibe-kanban-mcp --mode <global|orchestrator>\n  \
                     vibe-kanban-mcp --mode cursor-bridge --session-id <UUID>\n  \
                     vibe-kanban-mcp --mode session-placeholder --session-id <UUID>"
                );
                std::process::exit(0);
            }
            _ => {
                return Err(anyhow::anyhow!(
                    "Unknown argument '{arg}'. Run with --help for usage."
                ));
            }
        }
    }

    let mode_str = mode_arg
        .as_deref()
        .unwrap_or("global")
        .trim()
        .to_ascii_lowercase();

    let mode = match mode_str.as_str() {
        "global" => {
            if session_id_arg.is_some() {
                return Err(anyhow::anyhow!(
                    "--session-id is only valid with --mode cursor-bridge or session-placeholder"
                ));
            }
            McpLaunchMode::Global
        }
        "orchestrator" => {
            if session_id_arg.is_some() {
                return Err(anyhow::anyhow!(
                    "--session-id is only valid with --mode cursor-bridge or session-placeholder"
                ));
            }
            McpLaunchMode::Orchestrator
        }
        "cursor-bridge" => {
            let raw = session_id_arg.ok_or_else(|| {
                anyhow::anyhow!(
                    "--mode cursor-bridge requires --session-id <UUID> (the vibe-kanban session)"
                )
            })?;
            let session_id = uuid::Uuid::parse_str(raw.trim())
                .map_err(|err| anyhow::anyhow!("Invalid --session-id '{}': {}", raw, err))?;
            McpLaunchMode::CursorBridge { session_id }
        }
        "session-placeholder" => {
            let raw = session_id_arg.ok_or_else(|| {
                anyhow::anyhow!(
                    "--mode session-placeholder requires --session-id <UUID> (the vibe-kanban session)"
                )
            })?;
            let session_id = uuid::Uuid::parse_str(raw.trim())
                .map_err(|err| anyhow::anyhow!("Invalid --session-id '{}': {}", raw, err))?;
            McpLaunchMode::SessionPlaceholder { session_id }
        }
        value => {
            return Err(anyhow::anyhow!(
                "Invalid MCP mode '{value}'. Expected 'global', 'orchestrator', 'cursor-bridge', or 'session-placeholder'"
            ));
        }
    };

    Ok(LaunchConfig { mode })
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

#[cfg(test)]
mod tests {
    use super::{LaunchConfig, McpLaunchMode, resolve_launch_config_from_iter};

    #[test]
    fn orchestrator_mode_does_not_require_session_id() {
        let config = resolve_launch_config_from_iter(
            ["--mode".to_string(), "orchestrator".to_string()].into_iter(),
        )
        .expect("config should parse");

        assert_eq!(
            config,
            LaunchConfig {
                mode: McpLaunchMode::Orchestrator
            }
        );
    }

    #[test]
    fn cursor_bridge_requires_session_id() {
        let error = resolve_launch_config_from_iter(
            ["--mode".to_string(), "cursor-bridge".to_string()].into_iter(),
        )
        .expect_err("missing session id should error");
        assert!(error.to_string().contains("--session-id"));
    }

    #[test]
    fn cursor_bridge_parses_session_id() {
        let id = uuid::Uuid::new_v4();
        let config = resolve_launch_config_from_iter(
            [
                "--mode".to_string(),
                "cursor-bridge".to_string(),
                "--session-id".to_string(),
                id.to_string(),
            ]
            .into_iter(),
        )
        .expect("config should parse");

        assert_eq!(
            config,
            LaunchConfig {
                mode: McpLaunchMode::CursorBridge { session_id: id }
            }
        );
    }

    #[test]
    fn session_placeholder_parses_session_id() {
        let id = uuid::Uuid::new_v4();
        let config = resolve_launch_config_from_iter(
            [
                "--mode".to_string(),
                "session-placeholder".to_string(),
                "--session-id".to_string(),
                id.to_string(),
            ]
            .into_iter(),
        )
        .expect("config should parse");

        assert_eq!(
            config,
            LaunchConfig {
                mode: McpLaunchMode::SessionPlaceholder { session_id: id }
            }
        );
    }

    #[test]
    fn session_id_flag_is_rejected_for_global() {
        let error = resolve_launch_config_from_iter(
            [
                "--mode".to_string(),
                "global".to_string(),
                "--session-id".to_string(),
                "x".to_string(),
            ]
            .into_iter(),
        )
        .expect_err("session id flag should be rejected for global mode");

        assert!(error.to_string().contains("--session-id"));
    }
}
