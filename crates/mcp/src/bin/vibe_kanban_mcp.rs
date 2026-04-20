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
    /// v4 stdio bridge for Cursor IDE's Composer Agent. **Workspace-
    /// agnostic**: a single bridge serves all Composer chats; the
    /// backend routes by `sessionId`. The optional `label` shows up in
    /// the Inbox UI to disambiguate which Cursor window / machine
    /// produced a conversation.
    CursorBridge {
        label: Option<String>,
    },
    /// Long-lived no-op process used as the placeholder OS child for a
    /// `CURSOR_MCP` coding-agent session. The vibe-kanban executor
    /// framework requires a real `SpawnedChild`; this mode lives in that
    /// role and exits cleanly when its parent closes stdin or when an
    /// `EXIT` line is written.
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
                McpLaunchMode::CursorBridge { label } => {
                    tracing::info!("Starting Cursor MCP bridge (lobby mode, label={:?})", label);
                    let base_url = base_url_or_err?;
                    let server = CursorBridgeServer::new(&base_url, label);
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
    println!(
        "[vibe-kanban session {}] Cursor MCP placeholder ready. Configure Cursor's mcp.json with `vibe-kanban-mcp --mode cursor-bridge` (one global entry, no per-workspace flags) to start receiving Composer conversations.",
        session_id
    );

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
    let mut label_arg: Option<String> = None;

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
            "--label" => {
                label_arg = Some(args.next().ok_or_else(|| {
                    anyhow::anyhow!(
                        "Missing value for --label. Expected a short text shown in the Inbox UI"
                    )
                })?);
            }
            // v3 compat: silently accept and ignore --workspace-id so
            // already-deployed mcp.json entries don't error out.
            "--workspace-id" => {
                let _ = args.next();
                tracing::warn!(
                    "--workspace-id is no longer used in v4 (bridges are workspace-agnostic); ignoring"
                );
            }
            "-h" | "--help" => {
                println!(
                    "Usage:\n  \
                     vibe-kanban-mcp --mode <global|orchestrator>\n  \
                     vibe-kanban-mcp --mode cursor-bridge [--label <text>]\n  \
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
            if session_id_arg.is_some() || label_arg.is_some() {
                return Err(anyhow::anyhow!(
                    "--session-id / --label are not valid with --mode global"
                ));
            }
            McpLaunchMode::Global
        }
        "orchestrator" => {
            if session_id_arg.is_some() || label_arg.is_some() {
                return Err(anyhow::anyhow!(
                    "--session-id / --label are not valid with --mode orchestrator"
                ));
            }
            McpLaunchMode::Orchestrator
        }
        "cursor-bridge" => {
            if session_id_arg.is_some() {
                return Err(anyhow::anyhow!(
                    "--session-id is not valid with --mode cursor-bridge in v4 (bridges route by sessionId per tool call). Drop the flag."
                ));
            }
            McpLaunchMode::CursorBridge { label: label_arg }
        }
        "session-placeholder" => {
            if label_arg.is_some() {
                return Err(anyhow::anyhow!(
                    "--label is not valid with --mode session-placeholder"
                ));
            }
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

    // Default to `localhost` (not `127.0.0.1`) to match the hostname the
    // embedded server binds to in `server::startup::start_with_bind`.
    // On modern macOS `localhost` resolves to `::1` first, so the server
    // ends up listening only on IPv6; an IPv4 literal here would fail to
    // connect. Env overrides still win for users with custom setups.
    let host = std::env::var(HOST_ENV)
        .or_else(|_| std::env::var("HOST"))
        .unwrap_or_else(|_| "localhost".to_string());

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
    fn cursor_bridge_no_args_works() {
        let config = resolve_launch_config_from_iter(
            ["--mode".to_string(), "cursor-bridge".to_string()].into_iter(),
        )
        .expect("config should parse");
        assert_eq!(
            config,
            LaunchConfig {
                mode: McpLaunchMode::CursorBridge { label: None }
            }
        );
    }

    #[test]
    fn cursor_bridge_label_arg() {
        let config = resolve_launch_config_from_iter(
            [
                "--mode".to_string(),
                "cursor-bridge".to_string(),
                "--label".to_string(),
                "alice-mac · proj".to_string(),
            ]
            .into_iter(),
        )
        .expect("config should parse");
        assert_eq!(
            config,
            LaunchConfig {
                mode: McpLaunchMode::CursorBridge {
                    label: Some("alice-mac · proj".to_string())
                }
            }
        );
    }

    #[test]
    fn cursor_bridge_workspace_id_is_silently_dropped() {
        let config = resolve_launch_config_from_iter(
            [
                "--mode".to_string(),
                "cursor-bridge".to_string(),
                "--workspace-id".to_string(),
                uuid::Uuid::new_v4().to_string(),
            ]
            .into_iter(),
        )
        .expect("v3 --workspace-id flag should be silently ignored for backward compat");
        assert!(matches!(
            config.mode,
            McpLaunchMode::CursorBridge { label: None }
        ));
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
    fn cursor_bridge_rejects_session_id_flag() {
        let error = resolve_launch_config_from_iter(
            [
                "--mode".to_string(),
                "cursor-bridge".to_string(),
                "--session-id".to_string(),
                uuid::Uuid::new_v4().to_string(),
            ]
            .into_iter(),
        )
        .expect_err("session-id should be rejected for cursor-bridge");
        assert!(error.to_string().contains("--session-id"));
    }
}
