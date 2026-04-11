//! Relay host connection — registers the local backend with the relay server
//! so it can receive tunneled connections from remote browsers.

use std::net::SocketAddr;

use anyhow::Context as _;
use deployment::Deployment as _;
use relay_tunnel_core::client::{RelayClientConfig, start_relay_client};
use services::services::{config::Config, remote_client::RemoteClient};

use crate::DeploymentImpl;

const RELAY_RECONNECT_INITIAL_DELAY_SECS: u64 = 1;
const RELAY_RECONNECT_MAX_DELAY_SECS: u64 = 30;

pub fn default_host_nickname(user_id: &str) -> String {
    let os_type = os_info::get().os_type().to_string();
    format!("{os_type} host ({user_id})")
}

pub fn clean_host_nickname(config: &Config, user_id: &str) -> String {
    config
        .host_nickname
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| default_host_nickname(user_id))
}

struct RelayParams {
    server_addr: SocketAddr,
    remote_client: RemoteClient,
    relay_base: String,
    machine_id: String,
    host_nickname: String,
}

/// Resolve all preconditions for starting the relay. Returns `None` if any
/// requirement is missing (config, env, login, server info).
async fn resolve_relay_params(deployment: &DeploymentImpl) -> Option<RelayParams> {
    let config = deployment.config().read().await;
    if !config.relay_enabled {
        tracing::debug!("Relay disabled by config");
        return None;
    }
    let host_nickname = clean_host_nickname(&config, deployment.user_id());
    drop(config);

    let relay_base = deployment.remote_info().get_relay_api_base().or_else(|| {
        tracing::debug!("VK_SHARED_RELAY_API_BASE not set; relay unavailable");
        None
    })?;

    let remote_client = deployment.remote_client().ok().or_else(|| {
        tracing::debug!("Remote client not configured; relay unavailable");
        None
    })?;

    let login_status = deployment.get_login_status().await;
    if matches!(login_status, api_types::LoginStatus::LoggedOut) {
        tracing::debug!("Not logged in; relay will start on login");
        return None;
    }

    let server_addr = deployment.client_info().get_server_addr().or_else(|| {
        tracing::warn!("Server address not set; cannot spawn relay");
        None
    })?;

    Some(RelayParams {
        server_addr,
        remote_client,
        relay_base,
        machine_id: deployment.user_id().to_string(),
        host_nickname,
    })
}

/// Spawn the relay reconnect loop. Safe to call multiple times — cancels any
/// previous session first via `RelayControl::reset`.
pub async fn spawn_relay(deployment: &DeploymentImpl) {
    let Some(params) = resolve_relay_params(deployment).await else {
        return;
    };

    let cancel_token = deployment.relay_control().reset().await;

    tokio::spawn(async move {
        tracing::debug!("Relay auto-reconnect loop started");

        let mut delay = std::time::Duration::from_secs(RELAY_RECONNECT_INITIAL_DELAY_SECS);
        let max_delay = std::time::Duration::from_secs(RELAY_RECONNECT_MAX_DELAY_SECS);

        while !cancel_token.is_cancelled()
            && let Err(error) = start_relay(&params, cancel_token.clone()).await
        {
            tracing::debug!(
                ?error,
                retry_in_secs = delay.as_secs(),
                "Relay connection failed; retrying"
            );

            tokio::select! {
                _ = cancel_token.cancelled() => break,
                _ = tokio::time::sleep(delay) => {}
            }

            delay = std::cmp::min(delay.saturating_mul(2), max_delay);
        }

        tracing::debug!("Relay reconnect loop exited");
    });
}

/// Stop the relay by cancelling the current session token.
pub async fn stop_relay(deployment: &DeploymentImpl) {
    deployment.relay_control().stop().await;
    tracing::debug!("Relay stopped");
}

/// Start the relay client transport.
async fn start_relay(
    params: &RelayParams,
    shutdown: tokio_util::sync::CancellationToken,
) -> anyhow::Result<()> {
    let base_url = params.relay_base.trim_end_matches('/');

    let encoded_name = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("machine_id", &params.machine_id)
        .append_pair("name", &params.host_nickname)
        .append_pair("agent_version", env!("CARGO_PKG_VERSION"))
        .finish();

    let ws_url = if let Some(rest) = base_url.strip_prefix("https://") {
        format!("wss://{rest}/v1/relay/connect?{encoded_name}")
    } else if let Some(rest) = base_url.strip_prefix("http://") {
        format!("ws://{rest}/v1/relay/connect?{encoded_name}")
    } else {
        anyhow::bail!("Unexpected base URL scheme: {base_url}");
    };

    let access_token = params
        .remote_client
        .access_token()
        .await
        .context("Failed to get access token for relay")?;

    tracing::debug!(%ws_url, "Connecting relay control channel");

    start_relay_client(RelayClientConfig {
        ws_url,
        bearer_token: access_token,
        local_addr: params.server_addr,
        shutdown,
    })
    .await
}
