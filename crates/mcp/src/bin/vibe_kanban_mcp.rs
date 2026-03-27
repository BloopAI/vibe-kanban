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
    port: Option<u16>,
    host: Option<String>,
    backend_url: Option<String>,
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

            let base_url = resolve_base_url("vibe-kanban-mcp", &launch_config).await?;
            let LaunchConfig { mode, .. } = launch_config;

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
    let mut port = None;
    let mut host = None;
    let mut backend_url = None;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--mode" => {
                mode = Some(args.next().ok_or_else(|| {
                    anyhow::anyhow!("Missing value for --mode. Expected 'global' or 'orchestrator'")
                })?);
            }
            "--port" => {
                let value = args
                    .next()
                    .ok_or_else(|| anyhow::anyhow!("Missing value for --port"))?;
                port = Some(
                    value
                        .trim()
                        .parse::<u16>()
                        .map_err(|e| anyhow::anyhow!("Invalid port '{}': {}", value, e))?,
                );
            }
            "--host" => {
                host = Some(
                    args.next()
                        .ok_or_else(|| anyhow::anyhow!("Missing value for --host"))?,
                );
            }
            "--backend-url" => {
                backend_url = Some(
                    args.next()
                        .ok_or_else(|| anyhow::anyhow!("Missing value for --backend-url"))?,
                );
            }
            "-h" | "--help" => {
                println!(
                    "Usage: vibe-kanban-mcp [--mode <global|orchestrator>] [--port <PORT>] [--host <HOST>] [--backend-url <URL>]"
                );
                std::process::exit(0);
            }
            _ => {
                return Err(anyhow::anyhow!(
                    "Unknown argument '{arg}'. Usage: vibe-kanban-mcp [--mode <global|orchestrator>] [--port <PORT>] [--host <HOST>] [--backend-url <URL>]"
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

    Ok(LaunchConfig {
        mode,
        port,
        host,
        backend_url,
    })
}

async fn resolve_base_url(log_prefix: &str, config: &LaunchConfig) -> anyhow::Result<String> {
    if let Some(url) = &config.backend_url {
        tracing::info!(
            "[{}] Using backend URL from --backend-url: {}",
            log_prefix,
            url
        );
        return Ok(url.clone());
    }

    let host_override = config.host.clone().or_else(|| std::env::var(HOST_ENV).ok());
    let port_override = config
        .port
        .or_else(|| std::env::var(PORT_ENV).ok().and_then(|s| s.parse().ok()));

    if let Some(mut base) = std::env::var("VIBE_BACKEND_URL")
        .ok()
        .and_then(|u| url::Url::parse(&u).ok())
    {
        if let Some(h) = &host_override {
            let _ = base.set_host(Some(h));
        }
        if let Some(p) = port_override {
            let _ = base.set_port(Some(p));
        }
        let url = base.as_str().trim_end_matches('/').to_string();
        tracing::info!("[{}] Using backend URL: {}", log_prefix, url);
        return Ok(url);
    }

    let host = host_override
        .or_else(|| std::env::var("HOST").ok())
        .unwrap_or_else(|| "127.0.0.1".to_string());

    let port = if let Some(p) = port_override {
        p
    } else if let Ok(port_str) = std::env::var("BACKEND_PORT").or_else(|_| std::env::var("PORT")) {
        port_str
            .parse::<u16>()
            .map_err(|error| anyhow::anyhow!("Invalid port value '{}': {}", port_str, error))?
    } else {
        read_port_file("vibe-kanban").await?
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
                mode: McpLaunchMode::Orchestrator,
                port: None,
                host: None,
                backend_url: None,
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
