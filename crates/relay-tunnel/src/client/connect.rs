use anyhow::Context as _;
use futures_util::StreamExt;
use tokio_tungstenite::{Connector, tungstenite::client::IntoClientRequest};
use tokio_util::sync::CancellationToken;
use tokio_yamux::{Config as YamuxConfig, Session};

use super::{TcpForwardConfig, http};
use crate::ws_io::WsMessageStreamIo;

pub struct RelayClientConfig {
    pub ws_url: String,
    pub bearer_token: String,
    pub accept_invalid_certs: bool,
    pub local_addr: String,
    pub shutdown: CancellationToken,
    pub tcp_forward: Option<TcpForwardConfig>,
}

/// Connects the relay client control channel and starts handling inbound streams.
///
/// Returns when shutdown is requested or when the control channel disconnects/errors.
pub async fn start_relay_client(config: RelayClientConfig) -> anyhow::Result<()> {
    let mut request = config
        .ws_url
        .clone()
        .into_client_request()
        .context("Failed to build WS request")?;

    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {}", config.bearer_token)
            .parse()
            .context("Invalid auth header")?,
    );

    let mut tls_builder = native_tls::TlsConnector::builder();
    if config.accept_invalid_certs {
        tls_builder.danger_accept_invalid_certs(true);
    }
    let tls_connector = tls_builder
        .build()
        .context("Failed to build TLS connector")?;

    let (ws_stream, _response) = tokio_tungstenite::connect_async_tls_with_config(
        request,
        None,
        false,
        Some(Connector::NativeTls(tls_connector)),
    )
    .await
    .context("Failed to connect relay control channel")?;

    let ws_io = WsMessageStreamIo::new(
        ws_stream,
        http::read_client_message,
        http::write_client_message,
    );
    let mut session = Session::new_client(ws_io, YamuxConfig::default());
    let mut control = session.control();

    tracing::info!("relay control channel connected");

    let shutdown = config.shutdown;
    let local_addr = config.local_addr;
    let tcp_forward = config.tcp_forward;

    loop {
        tokio::select! {
            _ = shutdown.cancelled() => {
                control.close().await;
                return Ok(());
            }
            inbound = session.next() => {
                match inbound {
                    Some(Ok(stream)) => {
                        let local_addr = local_addr.clone();
                        let tcp_forward = tcp_forward.clone();
                        tokio::spawn(async move {
                            if let Err(error) = http::handle_inbound_stream(stream, local_addr, tcp_forward).await {
                                tracing::warn!(?error, "relay stream handling failed");
                            }
                        });
                    }
                    Some(Err(error)) => {
                        return Err(anyhow::anyhow!("relay yamux session error: {error}"));
                    }
                    None => {
                        return Err(anyhow::anyhow!("relay control channel closed"));
                    }
                }
            }
        }
    }
}
