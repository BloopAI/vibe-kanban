use std::sync::Arc;

use axum::{
    Extension, Json, Router,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
};
use deployment::Deployment as _;
use relay_webrtc::{IceCandidate, SdpOffer, WebRtcHost};
use tokio_util::sync::CancellationToken;

use crate::DeploymentImpl;

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let local_port = deployment.client_info().get_port().unwrap_or(0);
    let local_addr = format!("127.0.0.1:{local_port}");

    let webrtc_host = Arc::new(WebRtcHost::new(local_addr, CancellationToken::new()));

    Router::new()
        .route("/webrtc/offer", post(handle_offer))
        .route("/webrtc/candidate", post(handle_candidate))
        .layer(Extension(webrtc_host))
}

async fn handle_offer(
    Extension(webrtc_host): Extension<Arc<WebRtcHost>>,
    Json(offer): Json<SdpOffer>,
) -> Response {
    match webrtc_host.handle_offer(offer).await {
        Ok(answer) => Json(answer).into_response(),
        Err(e) => {
            tracing::warn!(?e, "WebRTC offer handling failed");
            (StatusCode::BAD_REQUEST, e.to_string()).into_response()
        }
    }
}

async fn handle_candidate(
    Extension(webrtc_host): Extension<Arc<WebRtcHost>>,
    Json(candidate): Json<IceCandidate>,
) -> Response {
    match webrtc_host.add_ice_candidate(candidate).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => {
            tracing::warn!(?e, "WebRTC candidate handling failed");
            (StatusCode::BAD_REQUEST, e.to_string()).into_response()
        }
    }
}
