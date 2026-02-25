//! Relay client bootstrap for remote access to the local server.
//!
//! App-specific concerns (login, host lifecycle) stay here. The transport and
//! muxing implementation lives in the `relay-tunnel` crate.

use anyhow::Context as _;
use deployment::Deployment as _;
use relay_tunnel::client::{RelayClientConfig, start_relay_client};
use services::services::remote_client::RemoteClient;
use trusted_key_auth::spake2::generate_one_time_code;
use uuid::Uuid;

use crate::DeploymentImpl;

const RELAY_RECONNECT_INITIAL_DELAY_SECS: u64 = 1;
const RELAY_RECONNECT_MAX_DELAY_SECS: u64 = 30;

fn relay_api_base() -> Option<String> {
    std::env::var("VK_SHARED_RELAY_API_BASE")
        .ok()
        .or_else(|| option_env!("VK_SHARED_RELAY_API_BASE").map(|s| s.to_string()))
}

/// Returns true if the relay should start based on config and environment.
pub async fn should_start_relay(deployment: &DeploymentImpl) -> bool {
    let config = deployment.config().read().await;
    if !config.relay_enabled {
        tracing::info!("Relay disabled by config");
        return false;
    }
    drop(config);

    if relay_api_base().is_none() {
        tracing::debug!("VK_SHARED_RELAY_API_BASE not set; relay unavailable");
        return false;
    }

    if deployment.remote_client().is_err() {
        tracing::debug!("Remote client not configured; relay unavailable");
        return false;
    }

    true
}

/// Called once at startup. Stores the local port and starts the relay if the
/// user is already logged in and relay is enabled.
pub async fn start_relay_lifecycle(deployment: &DeploymentImpl, local_port: u16) {
    deployment
        .relay_control()
        .set_local_port(local_port)
        .await;

    if !should_start_relay(deployment).await {
        return;
    }

    let login_status = deployment.get_login_status().await;
    if matches!(login_status, api_types::LoginStatus::LoggedOut) {
        tracing::info!("Not logged in at startup; relay will start on login");
        return;
    }

    tracing::info!("Already logged in at startup; starting relay");
    spawn_relay(deployment).await;
}

/// Spawn the relay reconnect loop. Safe to call multiple times — cancels any
/// previous session first via `RelayControl::start`.
pub async fn spawn_relay(deployment: &DeploymentImpl) {
    if !should_start_relay(deployment).await {
        return;
    }

    let Some(local_port) = deployment.relay_control().local_port().await else {
        tracing::warn!("Relay local port not set; cannot spawn relay");
        return;
    };

    let Ok(remote_client) = deployment.remote_client() else {
        tracing::warn!("Remote client unavailable; cannot spawn relay");
        return;
    };

    let Some(relay_base) = relay_api_base() else {
        tracing::warn!("VK_SHARED_RELAY_API_BASE not set; cannot spawn relay");
        return;
    };

    // Register or find existing host
    let local_identity = deployment.user_id();
    let host_name = format!("{} local ({local_identity})", env!("CARGO_PKG_NAME"));

    let existing_host_id = match remote_client.list_relay_hosts().await {
        Ok(hosts) => hosts
            .into_iter()
            .find(|host| host.name == host_name)
            .map(|host| host.id),
        Err(error) => {
            tracing::warn!(?error, "Failed to list relay hosts");
            None
        }
    };

    let host_id = if let Some(host_id) = existing_host_id {
        host_id
    } else {
        let create_host = api_types::CreateRelayHostRequest {
            name: host_name,
            agent_version: Some(env!("CARGO_PKG_VERSION").to_string()),
        };

        match remote_client.create_relay_host(&create_host).await {
            Ok(host) => host.id,
            Err(error) => {
                tracing::error!(?error, "Failed to register relay host");
                return;
            }
        }
    };

    let enrollment_code = deployment
        .get_or_set_enrollment_code(generate_one_time_code())
        .await;
    tracing::info!(
        %host_id,
        enrollment_code = %enrollment_code,
        "Relay PAKE enrollment code ready"
    );

    let cancel_token = deployment.relay_control().start().await;

    tokio::spawn(async move {
        tracing::info!("Relay auto-reconnect loop started");

        let mut reconnect_delay =
            std::time::Duration::from_secs(RELAY_RECONNECT_INITIAL_DELAY_SECS);
        let max_reconnect_delay = std::time::Duration::from_secs(RELAY_RECONNECT_MAX_DELAY_SECS);

        loop {
            if cancel_token.is_cancelled() {
                break;
            }

            let run_result = start_relay(
                local_port,
                &relay_base,
                &remote_client,
                host_id,
                cancel_token.clone(),
            )
            .await;

            let mut should_backoff = false;

            match run_result {
                Ok(()) => {
                    if !cancel_token.is_cancelled() {
                        tracing::warn!("Relay disconnected; reconnecting");
                    }
                    reconnect_delay =
                        std::time::Duration::from_secs(RELAY_RECONNECT_INITIAL_DELAY_SECS);
                }
                Err(error) => {
                    if cancel_token.is_cancelled() {
                        break;
                    }
                    tracing::warn!(
                        ?error,
                        retry_in_secs = reconnect_delay.as_secs(),
                        "Relay connection failed; retrying"
                    );
                    should_backoff = true;
                }
            }

            tokio::select! {
                _ = cancel_token.cancelled() => break,
                _ = tokio::time::sleep(reconnect_delay) => {}
            }

            if should_backoff {
                reconnect_delay =
                    std::cmp::min(reconnect_delay.saturating_mul(2), max_reconnect_delay);
            }
        }

        tracing::info!("Relay reconnect loop exited");
    });
}

/// Stop the relay by cancelling the current session token.
pub async fn stop_relay(deployment: &DeploymentImpl) {
    deployment.relay_control().stop().await;
    tracing::info!("Relay stopped");
}

/// Start the relay client transport.
pub async fn start_relay(
    local_port: u16,
    relay_api_base: &str,
    remote_client: &RemoteClient,
    host_id: Uuid,
    shutdown: tokio_util::sync::CancellationToken,
) -> anyhow::Result<()> {
    let base_url = relay_api_base.trim_end_matches('/');

    let ws_url = if let Some(rest) = base_url.strip_prefix("https://") {
        format!("wss://{rest}/v1/relay/connect/{host_id}")
    } else if let Some(rest) = base_url.strip_prefix("http://") {
        format!("ws://{rest}/v1/relay/connect/{host_id}")
    } else {
        anyhow::bail!("Unexpected base URL scheme: {base_url}");
    };

    let access_token = remote_client
        .access_token()
        .await
        .context("Failed to get access token for relay")?;

    tracing::info!(%ws_url, "connecting relay control channel");

    start_relay_client(RelayClientConfig {
        ws_url,
        bearer_token: access_token,
        accept_invalid_certs: cfg!(debug_assertions),
        local_addr: format!("127.0.0.1:{local_port}"),
        shutdown,
    })
    .await
}
