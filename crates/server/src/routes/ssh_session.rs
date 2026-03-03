use axum::{
    extract::{State, ws::WebSocketUpgrade},
    response::Response,
};
use deployment::Deployment;

use crate::DeploymentImpl;

pub async fn ssh_session_ws(
    State(deployment): State<DeploymentImpl>,
    ws: WebSocketUpgrade,
) -> Response {
    let ssh_config = deployment.ssh_config().clone();
    let relay_signing = deployment.relay_signing().clone();

    ws.on_upgrade(move |socket| async move {
        let stream = relay_tunnel::ws_io::axum_ws_stream_io(socket);
        if let Err(error) = embedded_ssh::run_ssh_session(stream, ssh_config, relay_signing).await {
            tracing::warn!(?error, "SSH session failed");
        }
    })
}
