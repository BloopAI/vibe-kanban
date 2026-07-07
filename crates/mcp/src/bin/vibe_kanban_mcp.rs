use mcp::task_server::McpServer;
use rmcp::{ServiceExt, transport::stdio};
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    port_file::read_port_file,
    sentry::{self as sentry_utils, SentrySource, sentry_layer},
};

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
            let LaunchConfig { mode } = launch_config;

            let server = match mode {
                McpLaunchMode::Global => McpServer::new_global(&base_url),
                McpLaunchMode::Orchestrator => McpServer::new_orchestrator(&base_url),
            };

            let service = server.init().await?.serve(stdio()).await.map_err(|error| {
                tracing::error!("serving error: {:?}", error);
                error
            })?;

            service.waiting().await?;
            Ok(())
        })
}

fn resolve_launch_config() -> anyhow::Result<LaunchConfig> {
    resolve_launch_config_from_iter(std::env::args().skip(1))
}

fn resolve_launch_config_from_iter<I>(mut args: I) -> anyhow::Result<LaunchConfig>
where
    I: Iterator<Item = String>,
{
    let mut mode = None;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--mode" => {
                mode = Some(args.next().ok_or_else(|| {
                    anyhow::anyhow!("Missing value for --mode. Expected 'global' or 'orchestrator'")
                })?);
            }
            "-h" | "--help" => {
                println!("Usage: vibe-kanban-mcp --mode <global|orchestrator>");
                std::process::exit(0);
            }
            _ => {
                return Err(anyhow::anyhow!(
                    "Unknown argument '{arg}'. Usage: vibe-kanban-mcp --mode <global|orchestrator>"
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

    Ok(LaunchConfig { mode })
}

/// Probe a candidate backend URL by sending a lightweight GET request.
/// Returns `true` if the backend responds (any HTTP status), `false` on
/// connection failure or timeout.
async fn probe_backend(url: &str, log_prefix: &str) -> bool {
    let probe_url = format!("{}/api/health", url.trim_end_matches('/'));
    tracing::debug!("[{}] Probing backend at {}", log_prefix, probe_url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_default();
    match client.get(&probe_url).send().await {
        Ok(_) => {
            tracing::debug!("[{}] Backend alive at {}", log_prefix, url);
            true
        }
        Err(e) => {
            tracing::debug!("[{}] Backend probe failed at {}: {}", log_prefix, url, e);
            false
        }
    }
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

    // Build candidate URL and validate it with a health-check probe.
    // If the primary host fails, try alternate loopback addresses to handle
    // the case where the backend binds to `localhost` (which may resolve to
    // `::1` on macOS) while we default to `127.0.0.1`, or vice versa.
    let primary_url = format!("http://{}:{}", host, port);
    if probe_backend(&primary_url, log_prefix).await {
        tracing::info!("[{}] Using backend URL: {}", log_prefix, primary_url);
        return Ok(primary_url);
    }

    // Try alternate loopback hosts
    let alternates: &[&str] = if host == "127.0.0.1" {
        &["localhost", "[::1]"]
    } else if host == "localhost" {
        &["127.0.0.1", "[::1]"]
    } else {
        &["localhost", "127.0.0.1"]
    };

    for alt_host in alternates {
        let alt_url = format!("http://{}:{}", alt_host, port);
        if probe_backend(&alt_url, log_prefix).await {
            tracing::info!(
                "[{}] Primary host {} unreachable, using alternate: {}",
                log_prefix,
                host,
                alt_url
            );
            return Ok(alt_url);
        }
    }

    // Fall through to original URL — downstream will report the real error
    tracing::warn!(
        "[{}] No backend responded on port {}. Using {} (may fail).",
        log_prefix,
        port,
        primary_url
    );
    Ok(primary_url)
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
    fn session_id_flag_is_rejected() {
        let error = resolve_launch_config_from_iter(
            [
                "--mode".to_string(),
                "orchestrator".to_string(),
                "--session-id".to_string(),
                "x".to_string(),
            ]
            .into_iter(),
        )
        .expect_err("session id flag should be rejected");

        assert!(
            error
                .to_string()
                .contains("Unknown argument '--session-id'")
        );
    }
}
