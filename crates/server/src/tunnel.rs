//! Relay client bootstrap for remote access to the local server.
//!
//! App-specific concerns (login, host lifecycle) stay here. The transport and
//! muxing implementation lives in the `relay-tunnel` crate.

use anyhow::Context as _;
use deployment::Deployment as _;
use relay_tunnel::client::{RelayClientConfig, start_relay_client};
use services::services::remote_client::RemoteClient;
use tokio_util::sync::CancellationToken;
use utils::browser::open_browser;
use uuid::Uuid;

use crate::DeploymentImpl;

const RELAY_RECONNECT_INITIAL_DELAY_SECS: u64 = 1;
const RELAY_RECONNECT_MAX_DELAY_SECS: u64 = 30;

/// Start relay mode if `VK_TUNNEL` is enabled.
pub async fn start_relay_if_requested(
    deployment: &DeploymentImpl,
    local_port: u16,
    shutdown: CancellationToken,
) {
    if std::env::var("VK_TUNNEL").is_err() {
        return;
    }

    let Ok(remote_client) = deployment.remote_client() else {
        tracing::error!(
            "VK_TUNNEL requires VK_SHARED_API_BASE to be set. Continuing without relay."
        );
        return;
    };

    let login_status = deployment.get_login_status().await;
    if matches!(login_status, api_types::LoginStatus::LoggedOut) {
        tracing::info!("Relay mode requires login. Opening browser...");
        let _ = open_browser(&format!("http://127.0.0.1:{local_port}")).await;

        let start = std::time::Instant::now();
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            let status = deployment.get_login_status().await;
            if !matches!(status, api_types::LoginStatus::LoggedOut) {
                tracing::info!("Login successful, starting relay...");
                break;
            }
            if start.elapsed() > std::time::Duration::from_secs(120) {
                tracing::error!("Timed out waiting for login. Continuing without relay.");
                return;
            }
        }
    }

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
                tracing::error!("Continuing without relay because host registration failed.");
                return;
            }
        }
    };

    let supervisor_shutdown = shutdown.clone();
    tokio::spawn(async move {
        tracing::info!("Relay auto-reconnect loop started");

        let mut reconnect_delay =
            std::time::Duration::from_secs(RELAY_RECONNECT_INITIAL_DELAY_SECS);
        let max_reconnect_delay = std::time::Duration::from_secs(RELAY_RECONNECT_MAX_DELAY_SECS);

        loop {
            if supervisor_shutdown.is_cancelled() {
                break;
            }

            let run_result = start_relay(
                local_port,
                &remote_client,
                host_id,
                supervisor_shutdown.clone(),
            )
            .await;

            let mut should_backoff = false;

            match run_result {
                Ok(()) => {
                    if !supervisor_shutdown.is_cancelled() {
                        tracing::warn!("Relay disconnected; reconnecting");
                    }
                    reconnect_delay =
                        std::time::Duration::from_secs(RELAY_RECONNECT_INITIAL_DELAY_SECS);
                }
                Err(error) => {
                    if supervisor_shutdown.is_cancelled() {
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
                _ = supervisor_shutdown.cancelled() => break,
                _ = tokio::time::sleep(reconnect_delay) => {}
            }

            if should_backoff {
                reconnect_delay =
                    std::cmp::min(reconnect_delay.saturating_mul(2), max_reconnect_delay);
            }
        }
    });
}

/// Start the relay client transport.
pub async fn start_relay(
    local_port: u16,
    remote_client: &RemoteClient,
    host_id: Uuid,
    shutdown: CancellationToken,
) -> anyhow::Result<()> {
    let base_url = remote_client.base_url().trim_end_matches('/');

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
