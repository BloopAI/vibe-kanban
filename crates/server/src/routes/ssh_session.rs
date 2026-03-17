use axum::{extract::State, response::IntoResponse};
use deployment::Deployment;

use crate::{DeploymentImpl, middleware::relay_ws::RelayWsUpgrade};

pub async fn ssh_session_ws(
    State(deployment): State<DeploymentImpl>,
    ws: RelayWsUpgrade,
) -> impl IntoResponse {
    let ssh_config = deployment.ssh_config().clone();
    let relay_signing = deployment.relay_signing().clone();

    ws.on_upgrade(move |socket| async move {
        let stream = socket.into_tunnel_stream();
        if let Err(error) = embedded_ssh::run_ssh_session(stream, ssh_config, relay_signing).await {
            tracing::warn!(?error, "SSH session failed");
        }
    })
}
