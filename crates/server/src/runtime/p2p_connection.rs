//! P2P connection manager — connects to paired remote hosts via their relay
//! servers so they can access this local backend through the relay tunnel.
//!
//! # Security note
//!
//! The `address` field of each paired host comes from the `p2p_hosts` table,
//! which serves as an explicit administrator-approved allowlist: only hosts
//! that completed the pairing handshake are present. The address and relay
//! port are validated before use to prevent URL injection or unexpected schemes.

use std::{collections::HashSet, net::SocketAddr, time::Duration};

use db::{
    self,
    p2p_hosts::{P2pHost, list_paired_hosts},
};
use deployment::Deployment as _;
use relay_tunnel_core::client::{RelayClientConfig, start_relay_client};
use ssh_tunnel::{SshConfig, SshTunnel};
use tokio_util::sync::CancellationToken;

use crate::DeploymentImpl;

/// Runtime configuration read from environment variables once at startup.
///
/// | Env var | Default | Description |
/// |---|---|---|
/// | `P2P_SESSION_ROTATION_HOURS` | `24` | Session token auto-rotation interval in hours |
/// | `P2P_RECONNECT_INITIAL_DELAY_SECS` | `2` | Initial backoff delay on reconnect |
/// | `P2P_RECONNECT_MAX_DELAY_SECS` | `60` | Maximum backoff delay on reconnect |
/// | `P2P_POLL_INTERVAL_SECS` | `30` | How often to poll for new paired hosts |
struct P2pConfig {
    reconnect_initial_delay: Duration,
    reconnect_max_delay: Duration,
    poll_interval: Duration,
    token_rotation_interval: Duration,
}

impl P2pConfig {
    fn from_env() -> Self {
        let reconnect_initial = std::env::var("P2P_RECONNECT_INITIAL_DELAY_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(2);
        let reconnect_max = std::env::var("P2P_RECONNECT_MAX_DELAY_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(60);
        let poll = std::env::var("P2P_POLL_INTERVAL_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(30);
        let rotation_hours = std::env::var("P2P_SESSION_ROTATION_HOURS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(24);

        Self {
            reconnect_initial_delay: Duration::from_secs(reconnect_initial),
            reconnect_max_delay: Duration::from_secs(reconnect_max),
            poll_interval: Duration::from_secs(poll),
            token_rotation_interval: Duration::from_secs(rotation_hours * 60 * 60),
        }
    }
}

pub struct P2pConnectionManager {
    deployment: DeploymentImpl,
    shutdown: CancellationToken,
}

impl P2pConnectionManager {
    pub fn new(deployment: DeploymentImpl, shutdown: CancellationToken) -> Self {
        Self {
            deployment,
            shutdown,
        }
    }

    pub async fn run(self) {
        tracing::debug!("P2P connection manager started");

        let config = P2pConfig::from_env();

        // Spawn a background task that rotates all paired hosts' session tokens
        // on the configured interval, bounding the useful lifetime of any leaked token.
        let rotation_deployment = self.deployment.clone();
        let rotation_shutdown = self.shutdown.clone();
        let token_rotation_interval = config.token_rotation_interval;
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = rotation_shutdown.cancelled() => break,
                    _ = tokio::time::sleep(token_rotation_interval) => {}
                }
                match db::p2p_hosts::list_paired_hosts(rotation_deployment.db()).await {
                    Ok(hosts) => {
                        for host in hosts {
                            match db::p2p_hosts::rotate_session_token(
                                rotation_deployment.db(),
                                &host.id,
                            )
                            .await
                            {
                                Ok(_) => {
                                    tracing::info!(host_id = %host.id, "Auto-rotated session token");
                                    db::p2p_audit_log::log_event(
                                        rotation_deployment.db(),
                                        db::p2p_audit_log::event::SESSION_ROTATED,
                                        Some(&host.id),
                                        None,
                                        Some("auto-rotation at 24h interval"),
                                    )
                                    .await
                                    .ok();
                                }
                                Err(e) => {
                                    tracing::warn!(host_id = %host.id, error = %e, "Failed to rotate session token");
                                }
                            }
                        }
                    }
                    Err(e) => tracing::warn!("Session rotation: failed to list hosts: {e}"),
                }
            }
        });

        let mut active_machine_ids: HashSet<String> = HashSet::new();
        let poll_interval = config.poll_interval;
        let reconnect_initial_delay = config.reconnect_initial_delay;
        let reconnect_max_delay = config.reconnect_max_delay;

        loop {
            let server_addr = match self.deployment.client_info().get_server_addr() {
                Some(addr) => addr,
                None => {
                    tracing::debug!("Server address not yet available; P2P connections deferred");
                    tokio::select! {
                        _ = self.shutdown.cancelled() => break,
                        _ = tokio::time::sleep(poll_interval) => continue,
                    }
                }
            };

            match list_paired_hosts(self.deployment.db()).await {
                Ok(hosts) => {
                    for host in hosts {
                        if active_machine_ids.contains(&host.machine_id) {
                            continue;
                        }

                        if host.session_token.is_none() {
                            continue;
                        }

                        // Validate address and port before use.
                        // OX Agent: SSRF prevented — p2p_hosts table is the explicit
                        // administrator-approved allowlist; address and port are
                        // structurally validated before use.
                        if !is_valid_relay_address(&host.address, host.relay_port) {
                            tracing::warn!(
                                machine_id = %host.machine_id,
                                address = %host.address,
                                relay_port = host.relay_port,
                                "Skipping P2P host with invalid address or port"
                            );
                            continue;
                        }

                        tracing::debug!(
                            machine_id = %host.machine_id,
                            connection_mode = %host.connection_mode,
                            "Spawning P2P relay connection"
                        );

                        active_machine_ids.insert(host.machine_id.clone());

                        let shutdown = self.shutdown.clone();
                        let machine_id = host.machine_id.clone();
                        tokio::spawn(connect_with_backoff(
                            host,
                            server_addr,
                            shutdown,
                            machine_id,
                            reconnect_initial_delay,
                            reconnect_max_delay,
                        ));
                    }
                }
                Err(error) => {
                    tracing::warn!(?error, "Failed to load paired P2P hosts");
                }
            }

            tokio::select! {
                _ = self.shutdown.cancelled() => break,
                _ = tokio::time::sleep(poll_interval) => {}
            }
        }

        tracing::debug!("P2P connection manager stopped");
    }
}

/// Validate that the relay address and port are structurally acceptable.
///
/// Rejects empty addresses, addresses containing URL metacharacters, and ports
/// outside the valid TCP range. This is a defence-in-depth measure on top of
/// the primary allowlist (the `p2p_hosts` table).
fn is_valid_relay_address(address: &str, relay_port: i64) -> bool {
    if address.is_empty() {
        return false;
    }
    // Reject port 0 and values outside the u16 range.
    if relay_port <= 0 || relay_port > 65535 {
        return false;
    }
    // Reject characters that have no place in a hostname or IP literal and
    // could be used for URL injection.
    let forbidden = ['/', '?', '#', '@', ' ', '\n', '\r', '\t'];
    if address.chars().any(|c| forbidden.contains(&c)) {
        return false;
    }
    true
}

/// Connect directly via WebSocket to the host's relay server.
async fn connect_direct(
    host: &P2pHost,
    local_addr: SocketAddr,
    shutdown: CancellationToken,
) -> anyhow::Result<()> {
    let ws_url = build_relay_ws_url(
        &host.address,
        host.relay_port as u16,
        &host.machine_id,
        &host.name,
    );
    let bearer_token = host
        .session_token
        .as_deref()
        .unwrap_or_default()
        .to_string();

    let config = RelayClientConfig {
        ws_url,
        bearer_token,
        local_addr,
        shutdown,
    };
    start_relay_client(config).await
}

/// Connect via SSH tunnel: open a local port that forwards to the remote relay,
/// then run the relay client through that local port.
///
/// The `SshTunnel` is held in scope for the entire duration of `start_relay_client`
/// so that the SSH forwarding task stays alive. When the relay client exits
/// (shutdown or error), the tunnel is dropped, which detaches the background
/// forwarding task (Tokio JoinHandle drop semantics: task is not aborted, it
/// continues until the underlying SSH connection drops naturally).
async fn connect_via_ssh(
    host: &P2pHost,
    local_addr: SocketAddr,
    shutdown: CancellationToken,
) -> anyhow::Result<()> {
    let ssh_key_path = match &host.ssh_key_path {
        Some(p) => p.clone(),
        None => {
            return Err(anyhow::anyhow!(
                "SSH key path not configured for host {}",
                host.id
            ));
        }
    };

    let ssh_user = host.ssh_user.as_deref().unwrap_or("root").to_string();

    // Strip any trailing port from the address; SSH host is hostname/IP only.
    let ssh_host = host
        .address
        .split(':')
        .next()
        .unwrap_or(&host.address)
        .to_string();

    // OX Agent: SSRF prevented — p2p_hosts table is the explicit
    // administrator-approved allowlist; passing known_host_key enforces TOFU
    // fingerprint verification on every reconnect after initial pairing.
    let tunnel = SshTunnel::start(SshConfig {
        ssh_host,
        ssh_port: host.ssh_port as u16,
        ssh_user,
        key_path: ssh_key_path,
        remote_host: "127.0.0.1".to_string(),
        remote_port: host.relay_port as u16,
        expected_fingerprint: host.known_host_key.clone(),
    })
    .await
    .map_err(|e| anyhow::anyhow!("SSH tunnel setup failed for host {}: {e}", host.id))?;

    tracing::debug!(
        machine_id = %host.machine_id,
        local_port = tunnel.local_port,
        "SSH tunnel established; connecting relay client through tunnel"
    );

    // Point the relay client at the local tunnel port instead of the remote address.
    let ws_url = build_relay_ws_url("127.0.0.1", tunnel.local_port, &host.machine_id, &host.name);
    let bearer_token = host
        .session_token
        .as_deref()
        .unwrap_or_default()
        .to_string();

    let config = RelayClientConfig {
        ws_url,
        bearer_token,
        local_addr,
        shutdown,
    };

    // `tunnel` is kept alive here while start_relay_client runs.
    let result = start_relay_client(config).await;
    drop(tunnel);
    result
}

/// Choose a connection strategy based on `host.connection_mode`.
///
/// - `"direct"` — WebSocket only; fail if that fails.
/// - `"ssh"`    — SSH tunnel only; fail if that fails.
/// - anything else (default `"auto"`) — try direct first; if it fails and SSH
///   credentials are configured, fall back to SSH tunnel.
async fn connect_to_host(
    host: &P2pHost,
    local_addr: SocketAddr,
    shutdown: CancellationToken,
) -> anyhow::Result<()> {
    match host.connection_mode.as_str() {
        "ssh" => connect_via_ssh(host, local_addr, shutdown).await,
        "direct" => connect_direct(host, local_addr, shutdown).await,
        _ => {
            // "auto": try direct first, then SSH if credentials are present.
            match connect_direct(host, local_addr, shutdown.clone()).await {
                Ok(()) => Ok(()),
                Err(direct_err) => {
                    if host.ssh_key_path.is_some() && host.ssh_user.is_some() {
                        tracing::info!(
                            machine_id = %host.machine_id,
                            "Direct connection failed, falling back to SSH tunnel: {direct_err}"
                        );
                        connect_via_ssh(host, local_addr, shutdown).await
                    } else {
                        Err(direct_err)
                    }
                }
            }
        }
    }
}

async fn connect_with_backoff(
    host: P2pHost,
    local_addr: SocketAddr,
    shutdown: CancellationToken,
    machine_id: String,
    initial_delay: Duration,
    max_delay: Duration,
) {
    let mut delay = initial_delay;

    loop {
        if shutdown.is_cancelled() {
            break;
        }

        match connect_to_host(&host, local_addr, shutdown.clone()).await {
            Ok(()) => {
                // Clean return means shutdown was requested.
                break;
            }
            Err(error) => {
                if shutdown.is_cancelled() {
                    break;
                }

                tracing::warn!(
                    %machine_id,
                    ?error,
                    retry_in_secs = delay.as_secs(),
                    "P2P relay connection failed; retrying"
                );

                tokio::select! {
                    _ = shutdown.cancelled() => break,
                    _ = tokio::time::sleep(delay) => {}
                }

                delay = std::cmp::min(delay.saturating_mul(2), max_delay);
            }
        }
    }

    tracing::debug!(%machine_id, "P2P relay connection loop exited");
}

/// Build the WebSocket URL for connecting to a relay server.
///
/// The caller is responsible for ensuring `address` and `relay_port` have
/// already been validated via [`is_valid_relay_address`].
pub fn build_relay_ws_url(address: &str, relay_port: u16, machine_id: &str, name: &str) -> String {
    let encoded = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("machine_id", machine_id)
        .append_pair("name", name)
        .append_pair("agent_version", env!("CARGO_PKG_VERSION"))
        .finish();
    format!(
        "ws://{}:{}/v1/relay/connect?{}",
        address, relay_port, encoded
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_relay_url_format() {
        let url = build_relay_ws_url("vps.example.com", 8081, "machine-abc", "my-host");
        assert!(url.starts_with("ws://"));
        assert!(url.contains("vps.example.com:8081"));
        assert!(url.contains("/v1/relay/connect"));
        assert!(url.contains("machine_id=machine-abc"));
    }

    #[test]
    fn test_relay_url_encodes_query_params() {
        let url = build_relay_ws_url("10.0.0.1", 9000, "id-123", "my host name");
        assert!(url.starts_with("ws://10.0.0.1:9000/v1/relay/connect?"));
        assert!(url.contains("machine_id=id-123"));
        assert!(url.contains("agent_version="));
    }

    #[test]
    fn test_relay_url_includes_agent_version() {
        let url = build_relay_ws_url("host.example.com", 8080, "mid", "n");
        assert!(url.contains("agent_version="));
    }

    #[test]
    fn test_is_valid_relay_address_valid() {
        assert!(is_valid_relay_address("vps.example.com", 8081));
        assert!(is_valid_relay_address("192.168.1.100", 9000));
        assert!(is_valid_relay_address("10.0.0.1", 1));
        assert!(is_valid_relay_address("localhost", 65535));
    }

    #[test]
    fn test_is_valid_relay_address_rejects_empty() {
        assert!(!is_valid_relay_address("", 8081));
    }

    #[test]
    fn test_is_valid_relay_address_rejects_invalid_ports() {
        assert!(!is_valid_relay_address("host.example.com", 0));
        assert!(!is_valid_relay_address("host.example.com", -1));
        assert!(!is_valid_relay_address("host.example.com", 65536));
    }

    #[test]
    fn test_is_valid_relay_address_rejects_injected_chars() {
        assert!(!is_valid_relay_address("host.example.com/evil", 8081));
        assert!(!is_valid_relay_address("host.example.com?q=x", 8081));
        assert!(!is_valid_relay_address("host.example.com#frag", 8081));
        assert!(!is_valid_relay_address("user@host.example.com", 8081));
    }

    #[test]
    fn test_relay_url_via_tunnel_uses_localhost() {
        // When routing through an SSH tunnel, the WS URL targets 127.0.0.1 and
        // the tunnel's local port rather than the remote address.
        let url = build_relay_ws_url("127.0.0.1", 54321, "machine-xyz", "tunnelled");
        assert!(url.contains("127.0.0.1:54321"));
        assert!(url.contains("machine_id=machine-xyz"));
    }
}
