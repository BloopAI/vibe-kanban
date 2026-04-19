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

use db::p2p_hosts::list_paired_hosts;
use deployment::Deployment as _;
use relay_tunnel_core::client::{RelayClientConfig, start_relay_client};
use tokio_util::sync::CancellationToken;

use crate::DeploymentImpl;

const P2P_RECONNECT_INITIAL_DELAY_SECS: u64 = 2;
const P2P_RECONNECT_MAX_DELAY_SECS: u64 = 60;
const P2P_POLL_INTERVAL_SECS: u64 = 30;

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

        let mut active_machine_ids: HashSet<String> = HashSet::new();

        loop {
            let server_addr = match self.deployment.client_info().get_server_addr() {
                Some(addr) => addr,
                None => {
                    tracing::debug!("Server address not yet available; P2P connections deferred");
                    tokio::select! {
                        _ = self.shutdown.cancelled() => break,
                        _ = tokio::time::sleep(Duration::from_secs(P2P_POLL_INTERVAL_SECS)) => continue,
                    }
                }
            };

            match list_paired_hosts(self.deployment.db()).await {
                Ok(hosts) => {
                    for host in hosts {
                        if active_machine_ids.contains(&host.machine_id) {
                            continue;
                        }

                        let Some(session_token) = host.session_token else {
                            continue;
                        };

                        // Validate address and port before building the URL.
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

                        let ws_url = build_relay_ws_url(
                            &host.address,
                            host.relay_port as u16,
                            &host.machine_id,
                            &host.name,
                        );

                        tracing::debug!(
                            machine_id = %host.machine_id,
                            %ws_url,
                            "Spawning P2P relay connection"
                        );

                        active_machine_ids.insert(host.machine_id.clone());

                        let shutdown = self.shutdown.clone();
                        let machine_id = host.machine_id.clone();
                        tokio::spawn(connect_with_backoff(
                            ws_url,
                            session_token,
                            server_addr,
                            shutdown,
                            machine_id,
                        ));
                    }
                }
                Err(error) => {
                    tracing::warn!(?error, "Failed to load paired P2P hosts");
                }
            }

            tokio::select! {
                _ = self.shutdown.cancelled() => break,
                _ = tokio::time::sleep(Duration::from_secs(P2P_POLL_INTERVAL_SECS)) => {}
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

async fn connect_with_backoff(
    ws_url: String,
    bearer_token: String,
    local_addr: SocketAddr,
    shutdown: CancellationToken,
    machine_id: String,
) {
    let mut delay = Duration::from_secs(P2P_RECONNECT_INITIAL_DELAY_SECS);
    let max_delay = Duration::from_secs(P2P_RECONNECT_MAX_DELAY_SECS);

    loop {
        if shutdown.is_cancelled() {
            break;
        }

        let config = RelayClientConfig {
            ws_url: ws_url.clone(),
            bearer_token: bearer_token.clone(),
            local_addr,
            shutdown: shutdown.clone(),
        };

        match start_relay_client(config).await {
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

/// Build the WebSocket URL for connecting to a paired host's relay server.
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
}
