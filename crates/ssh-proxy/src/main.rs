//! SSH proxy command for relay tunneling.
//!
//! Bridges stdin/stdout to a WebSocket connection to the remote server's
//! SSH relay endpoint. Intended for use as an OpenSSH `ProxyCommand` or
//! VS Code Remote-SSH proxy.
//!
//! Usage:
//!   ssh -o ProxyCommand="vibe-kanban-ssh-proxy --host-id %h ..." user@host

use anyhow::Context as _;
use clap::Parser;
use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_tungstenite::{Connector, tungstenite};

#[derive(Parser)]
#[command(about = "SSH proxy command for relay tunneling")]
struct Args {
    /// Host ID to connect to
    #[arg(long)]
    host_id: String,

    /// Remote server base URL (e.g. https://app.example.com)
    #[arg(long, env = "VK_REMOTE_URL")]
    remote_url: String,

    /// Bearer token for authentication
    #[arg(long, env = "VK_ACCESS_TOKEN")]
    access_token: String,

    /// Accept invalid TLS certificates (for development)
    #[arg(long, default_value_t = false)]
    accept_invalid_certs: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
        )
        .init();

    let args = Args::parse();

    let base = args.remote_url.trim_end_matches('/');
    let ws_url = if let Some(rest) = base.strip_prefix("https://") {
        format!("wss://{rest}/v1/relay/ssh/{}", args.host_id)
    } else if let Some(rest) = base.strip_prefix("http://") {
        format!("ws://{rest}/v1/relay/ssh/{}", args.host_id)
    } else {
        anyhow::bail!("Unexpected URL scheme: {base}");
    };

    let mut request = ws_url
        .clone()
        .into_client_request()
        .context("Failed to build WebSocket request")?;

    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {}", args.access_token)
            .parse()
            .context("Invalid auth header")?,
    );

    let mut tls_builder = native_tls::TlsConnector::builder();
    if args.accept_invalid_certs {
        tls_builder.danger_accept_invalid_certs(true);
    }
    let tls_connector = tls_builder
        .build()
        .context("Failed to build TLS connector")?;

    tracing::debug!(%ws_url, "connecting SSH relay");

    let (ws_stream, _response) = tokio_tungstenite::connect_async_tls_with_config(
        request,
        None,
        false,
        Some(Connector::NativeTls(tls_connector)),
    )
    .await
    .context("Failed to connect to SSH relay")?;

    tracing::debug!("SSH relay connected, bridging stdin/stdout");

    let (mut ws_write, mut ws_read) = ws_stream.split();
    let mut stdin = tokio::io::stdin();
    let mut stdout = tokio::io::stdout();

    let stdin_to_ws = async {
        let mut buf = [0u8; 8192];
        loop {
            let n = stdin.read(&mut buf).await?;
            if n == 0 {
                let _ = ws_write.close().await;
                break;
            }
            ws_write
                .send(tungstenite::Message::Binary(buf[..n].to_vec().into()))
                .await
                .context("Failed to send to WebSocket")?;
        }
        anyhow::Ok(())
    };

    let ws_to_stdout = async {
        while let Some(msg) = ws_read.next().await {
            match msg.context("WebSocket read error")? {
                tungstenite::Message::Binary(data) => {
                    stdout
                        .write_all(&data)
                        .await
                        .context("Failed to write to stdout")?;
                    stdout.flush().await.context("Failed to flush stdout")?;
                }
                tungstenite::Message::Close(_) => break,
                _ => {}
            }
        }
        anyhow::Ok(())
    };

    tokio::select! {
        r = stdin_to_ws => r?,
        r = ws_to_stdout => r?,
    }

    Ok(())
}

use tungstenite::client::IntoClientRequest;
