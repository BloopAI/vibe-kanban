use std::{collections::HashMap, sync::Arc};

use tokio::{net::TcpListener, sync::Mutex};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::RelayHost;

#[derive(Clone)]
pub struct TunnelManager {
    tunnels: Arc<Mutex<HashMap<Uuid, ActiveTunnel>>>,
    shutdown: CancellationToken,
}

struct ActiveTunnel {
    id: Uuid,
    local_port: u16,
    cancel: CancellationToken,
}

impl TunnelManager {
    pub fn new(shutdown: CancellationToken) -> Self {
        Self {
            tunnels: Arc::new(Mutex::new(HashMap::new())),
            shutdown,
        }
    }

    pub async fn get_or_create_ssh_tunnel(&self, relay_host: RelayHost) -> std::io::Result<u16> {
        let host_id = relay_host.identity.host_id;

        {
            let tunnels = self.tunnels.lock().await;
            if let Some(tunnel) = tunnels.get(&host_id)
                && !tunnel.cancel.is_cancelled()
            {
                return Ok(tunnel.local_port);
            }
        }

        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let local_port = listener.local_addr()?.port();
        let tunnel_id = Uuid::new_v4();
        let cancel = self.shutdown.child_token();

        {
            let mut tunnels = self.tunnels.lock().await;
            if let Some(tunnel) = tunnels.get(&host_id)
                && !tunnel.cancel.is_cancelled()
            {
                return Ok(tunnel.local_port);
            }

            tunnels.insert(
                host_id,
                ActiveTunnel {
                    id: tunnel_id,
                    local_port,
                    cancel: cancel.clone(),
                },
            );
        }

        let tunnels = self.tunnels.clone();
        let cancel_clone = cancel.clone();
        tokio::spawn(async move {
            run_tunnel_listener(relay_host, listener, cancel_clone).await;

            let mut tunnels = tunnels.lock().await;
            if tunnels
                .get(&host_id)
                .is_some_and(|active| active.id == tunnel_id)
            {
                tunnels.remove(&host_id);
            }
        });

        Ok(local_port)
    }

    pub async fn cancel_tunnel(&self, host_id: Uuid) {
        let mut tunnels = self.tunnels.lock().await;
        if let Some(tunnel) = tunnels.remove(&host_id) {
            tunnel.cancel.cancel();
        }
    }
}

async fn run_tunnel_listener(
    relay_host: RelayHost,
    listener: TcpListener,
    cancel: CancellationToken,
) {
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            result = listener.accept() => {
                match result {
                    Ok((tcp_stream, _)) => {
                        let relay_host = relay_host.clone();
                        tokio::spawn(async move {
                            match relay_host.proxy_ws("/api/ssh-session", None).await {
                                Ok(upstream_ws) => {
                                    if let Err(error) = upstream_ws.bridge_tcp(tcp_stream).await {
                                        tracing::debug!(?error, "SSH tunnel bridge ended");
                                    }
                                }
                                Err(error) => {
                                    tracing::debug!(?error, "Failed to open upstream SSH session WS");
                                }
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
