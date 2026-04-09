use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
};
use rmcp::{ServiceExt, transport::stdio};
use server::mcp::task_server::TaskServer;
use std::sync::Arc;
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::port_file::read_port_file;

/// CLI arguments for MCP task server
struct Args {
    /// Run in HTTP mode instead of stdio
    http: bool,
    /// Port for HTTP server (only used with --http)
    port: Option<u16>,
}

impl Args {
    fn parse() -> Self {
        let args: Vec<String> = std::env::args().collect();
        let mut http = false;
        let mut port = None;

        let mut i = 1;
        while i < args.len() {
            match args[i].as_str() {
                "--http" => http = true,
                "--port" => {
                    i += 1;
                    if i < args.len() {
                        port = args[i].parse().ok();
                    }
                }
                _ => {}
            }
            i += 1;
        }

        Args { http, port }
    }
}

/// Determines the backend base URL from environment variables or port file
async fn get_base_url() -> anyhow::Result<String> {
    if let Ok(url) = std::env::var("VIBE_BACKEND_URL") {
        tracing::info!("[MCP] Using backend URL from VIBE_BACKEND_URL: {}", url);
        return Ok(url);
    }

    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());

    // Get port from environment variables or fall back to port file
    let port = match std::env::var("BACKEND_PORT").or_else(|_| std::env::var("PORT")) {
        Ok(port_str) => {
            tracing::info!("[MCP] Using port from environment: {}", port_str);
            port_str
                .parse::<u16>()
                .map_err(|e| anyhow::anyhow!("Invalid port value '{}': {}", port_str, e))?
        }
        Err(_) => {
            let port = read_port_file("vibe-kanban").await?;
            tracing::info!("[MCP] Using port from port file: {}", port);
            port
        }
    };

    let url = format!("http://{}:{}", host, port);
    tracing::info!("[MCP] Using backend URL: {}", url);
    Ok(url)
}

/// Run the MCP server in stdio mode (default)
async fn run_stdio_server(base_url: &str) -> anyhow::Result<()> {
    let service = TaskServer::new(base_url)
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
}

/// Run the MCP server in HTTP mode
async fn run_http_server(base_url: &str, port: u16) -> anyhow::Result<()> {
    // Bind to 0.0.0.0 so the MCP server is reachable on all interfaces
    // (localhost and any network IP). The parent node server controls access.
    let bind_address = format!("0.0.0.0:{}", port);

    tracing::info!("[MCP] Starting HTTP server at http://{}/mcp", bind_address);

    // Initialize server and clone template for each session
    let template_server = Arc::new(TaskServer::new(base_url).init().await);

    let service = StreamableHttpService::new(
        move || Ok((*template_server).clone()),
        LocalSessionManager::default().into(),
        StreamableHttpServerConfig::default(),
    );

    let router = axum::Router::new().nest_service("/mcp", service);
    let tcp_listener = tokio::net::TcpListener::bind(&bind_address).await?;

    tracing::info!("[MCP] HTTP server listening at http://{}/mcp", bind_address);

    axum::serve(tcp_listener, router)
        .with_graceful_shutdown(async move {
            tokio::signal::ctrl_c().await.unwrap();
            tracing::info!("[MCP] Received shutdown signal, stopping HTTP server...");
        })
        .await?;

    Ok(())
}

fn main() -> anyhow::Result<()> {
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
                .init();

            let version = env!("CARGO_PKG_VERSION");
            tracing::debug!("[MCP] Starting MCP task server version {version}...");

            let args = Args::parse();
            let base_url = get_base_url().await?;

            if args.http {
                let port = args.port.unwrap_or(8080);
                run_http_server(&base_url, port).await
            } else {
                run_stdio_server(&base_url).await
            }
        })
}
