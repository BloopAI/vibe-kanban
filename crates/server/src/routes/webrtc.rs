use axum::{
    Json, Router, extract::State, http::StatusCode, response::Json as ResponseJson, routing::post,
};
use relay_webrtc::{IceCandidate, SdpAnswer, SdpOffer};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/webrtc/offer", post(handle_offer))
        .route("/webrtc/candidate", post(handle_candidate))
}

async fn handle_offer(
    State(deployment): State<DeploymentImpl>,
    Json(offer): Json<SdpOffer>,
) -> Result<ResponseJson<ApiResponse<SdpAnswer>>, ApiError> {
    let Some(webrtc_host) = deployment.webrtc_host() else {
        return Err(ApiError::BadRequest(
            "Local server address is not available".to_string(),
        ));
    };

    let answer = webrtc_host.handle_offer(offer).await?;
    Ok(ResponseJson(ApiResponse::success(answer)))
}

async fn handle_candidate(
    State(deployment): State<DeploymentImpl>,
    Json(candidate): Json<IceCandidate>,
) -> Result<StatusCode, ApiError> {
    let Some(webrtc_host) = deployment.webrtc_host() else {
        return Err(ApiError::BadRequest(
            "Local server address is not available".to_string(),
        ));
    };

    webrtc_host.add_ice_candidate(candidate).await?;
    Ok(StatusCode::NO_CONTENT)
}
