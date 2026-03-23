//! TCP port tunnel manager.
//!
//! Creates local TCP listeners that tunnel to remote relay hosts via WebSocket.
//! Each tunnel bridges `localhost:{local_port}` → WS → relay proxy → host backend → `localhost:{remote_port}`.

use std::{collections::HashMap, sync::Arc};

use anyhow::Context as _;
use relay_control::signing::{self, RelaySigningService};
use relay_tunnel_core::{tls::ws_connector, ws_io::tungstenite_ws_stream_io};
use relay_ws::signed_tungstenite_websocket;
use tokio::{net::TcpListener, sync::Mutex};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

/// Key for deduplicating tunnels.
#[derive(Clone, Debug, Hash, Eq, PartialEq)]
struct TunnelKey {
    host_id: Uuid,
    api_path: String,
}

struct ActiveTunnel {
    id: Uuid,
    local_port: u16,
    relay_session_base_url: String,
    signing_session_id: Uuid,
    cancel: CancellationToken,
}

pub struct TunnelManager {
    tunnels: Arc<Mutex<HashMap<TunnelKey, ActiveTunnel>>>,
    signing: RelaySigningService,
}

impl TunnelManager {
    pub fn new(signing: RelaySigningService) -> Self {
        Self {
            tunnels: Arc::new(Mutex::new(HashMap::new())),
            signing,
        }
    }

    /// Get or create a tunnel to the embedded SSH session endpoint.
    /// Returns the local port to connect to.
    pub async fn get_or_create_ssh_tunnel(
        &self,
        host_id: Uuid,
        relay_session_base_url: &str,
        signing_session_id: Uuid,
    ) -> std::io::Result<u16> {
        let local_port = self
            .get_or_create_tunnel_for_path(
                host_id,
                relay_session_base_url,
                signing_session_id,
                "/api/ssh-session",
            )
            .await?;
        tracing::debug!(local_port, "SSH session tunnel created");
        Ok(local_port)
    }

    async fn get_or_create_tunnel_for_path(
        &self,
        host_id: Uuid,
        relay_session_base_url: &str,
        signing_session_id: Uuid,
        api_path: &str,
    ) -> std::io::Result<u16> {
        let key = TunnelKey {
            host_id,
            api_path: api_path.to_string(),
        };

        // Check for existing healthy tunnel.
        // If signing session or relay session rotated, replace the existing tunnel.
        {
            let mut tunnels = self.tunnels.lock().await;
            if let Some(tunnel) = tunnels.get(&key)
                && !tunnel.cancel.is_cancelled()
            {
                if tunnel.signing_session_id == signing_session_id
                    && tunnel.relay_session_base_url == relay_session_base_url
                {
                    return Ok(tunnel.local_port);
                }

                tracing::debug!(
                    previous_relay_session_base_url = %tunnel.relay_session_base_url,
                    new_relay_session_base_url = %relay_session_base_url,
                    previous_signing_session_id = %tunnel.signing_session_id,
                    new_signing_session_id = %signing_session_id,
                    local_port = tunnel.local_port,
                    "Replacing tunnel after session rotation"
                );
                tunnel.cancel.cancel();
                tunnels.remove(&key);
            }
        }

        // Create new tunnel
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let local_port = listener.local_addr()?.port();
        let tunnel_id = Uuid::new_v4();
        let cancel = CancellationToken::new();
        let relay_session_base_url_owned = relay_session_base_url.to_string();
        {
            let mut tunnels = self.tunnels.lock().await;
            if let Some(tunnel) = tunnels.get(&key)
                && !tunnel.cancel.is_cancelled()
            {
                if tunnel.signing_session_id == signing_session_id
                    && tunnel.relay_session_base_url == relay_session_base_url
                {
                    return Ok(tunnel.local_port);
                }

                tracing::debug!(
                    previous_relay_session_base_url = %tunnel.relay_session_base_url,
                    new_relay_session_base_url = %relay_session_base_url,
                    previous_signing_session_id = %tunnel.signing_session_id,
                    new_signing_session_id = %signing_session_id,
                    local_port = tunnel.local_port,
                    "Replacing tunnel after session rotation"
                );
                tunnel.cancel.cancel();
                tunnels.remove(&key);
            }

            tunnels.insert(
                key.clone(),
                ActiveTunnel {
                    id: tunnel_id,
                    local_port,
                    relay_session_base_url: relay_session_base_url_owned.clone(),
                    signing_session_id,
                    cancel: cancel.clone(),
                },
            );
        }

        let cancel_clone = cancel.clone();
        let relay_session_base_url_for_task = relay_session_base_url_owned;
        let signing = self.signing.clone();
        let tunnels = self.tunnels.clone();
        let key_clone = key;
        let tunnel_id_clone = tunnel_id;
        let api_path = api_path.to_string();

        tokio::spawn(async move {
            run_tunnel_listener(
                listener,
                &relay_session_base_url_for_task,
                &signing,
                signing_session_id,
                &api_path,
                cancel_clone,
            )
            .await;

            // Clean up on exit, but only if this task still owns the key.
            let mut tunnels = tunnels.lock().await;
            if tunnels
                .get(&key_clone)
                .is_some_and(|active| active.id == tunnel_id_clone)
            {
                tunnels.remove(&key_clone);
            }
        });

        Ok(local_port)
    }
}

async fn run_tunnel_listener(
    listener: TcpListener,
    relay_session_base_url: &str,
    signing: &RelaySigningService,
    signing_session_id: Uuid,
    api_path: &str,
    cancel: CancellationToken,
) {
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            result = listener.accept() => {
                match result {
                    Ok((tcp_stream, _addr)) => {
                        let relay_session_base_url = relay_session_base_url.to_string();
                        let signing = signing.clone();
                        let api_path = api_path.to_string();
                        tokio::spawn(async move {
                            if let Err(error) = bridge_tcp_to_relay(
                                tcp_stream,
                                &relay_session_base_url,
                                &signing,
                                signing_session_id,
                                &api_path,
                            )
                            .await
                            {
                                tracing::warn!(?error, "Tunnel bridge failed");
                            }
                        });
                    }
                    Err(error) => {
                        tracing::warn!(?error, "Tunnel accept failed");
                        break;
                    }
                }
            }
        }
    }
}

/// Bridge a single TCP connection to the relay via signed WebSocket.
async fn bridge_tcp_to_relay(
    mut tcp_stream: tokio::net::TcpStream,
    relay_session_base_url: &str,
    signing: &RelaySigningService,
    signing_session_id: Uuid,
    api_path: &str,
) -> anyhow::Result<()> {
    let base = relay_session_base_url.trim_end_matches('/');
    let ws_url = relay_tunnel_core::http_to_ws_url(&format!("{base}{api_path}"))?;

    let sig = signing.sign_request(signing_session_id, "GET", api_path, &[]);

    let mut request = ws_url
        .into_client_request()
        .context("Failed to build WS request")?;

    request.headers_mut().insert(
        signing::SIGNING_SESSION_HEADER,
        sig.signing_session_id.to_string().parse()?,
    );
    request.headers_mut().insert(
        signing::TIMESTAMP_HEADER,
        sig.timestamp.to_string().parse()?,
    );
    request
        .headers_mut()
        .insert(signing::NONCE_HEADER, sig.nonce.to_string().parse()?);
    request.headers_mut().insert(
        signing::REQUEST_SIGNATURE_HEADER,
        sig.signature_b64.parse()?,
    );

    let (ws_stream, _response) =
        tokio_tungstenite::connect_async_tls_with_config(request, None, false, ws_connector())
            .await
            .context("Failed to connect relay tunnel WS")?;

    let signed_ws = signed_tungstenite_websocket(signing, &sig, ws_stream)
        .await
        .context("Failed to create signed WebSocket")?;

    let mut ws_io = tungstenite_ws_stream_io(signed_ws);

    tokio::io::copy_bidirectional(&mut tcp_stream, &mut ws_io)
        .await
        .context("Tunnel copy ended")?;

    Ok(())
}
