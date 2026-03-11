use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json as ResponseJson, Response},
    routing::{delete, get, post},
};
use deployment::Deployment;
use relay_hosts::RelayPairingClientError;
use relay_types::{
    ListRelayPairedHostsResponse, PairRelayHostRequest, PairRelayHostResponse,
    RemoveRelayPairedHostResponse,
};
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/relay-auth/client/pair", post(pair_relay_host))
        .route("/relay-auth/client/hosts", get(list_relay_paired_hosts))
        .route(
            "/relay-auth/client/hosts/{host_id}",
            delete(remove_relay_paired_host),
        )
}

pub async fn pair_relay_host(
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<PairRelayHostRequest>,
) -> Response {
    let relay_hosts = match deployment.relay_hosts() {
        Ok(relay_hosts) => relay_hosts,
        Err(error) => return ApiError::from(error).into_response(),
    };

    match relay_hosts.pair_host(&req).await {
        Ok(()) => (
            StatusCode::OK,
            Json(ApiResponse::<PairRelayHostResponse>::success(
                PairRelayHostResponse { paired: true },
            )),
        )
            .into_response(),
        Err(error) => map_pair_relay_host_error(req.host_id, error),
    }
}

pub async fn list_relay_paired_hosts(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ListRelayPairedHostsResponse>>, ApiError> {
    let hosts = deployment.relay_hosts()?.list_hosts().await;
    Ok(ResponseJson(ApiResponse::success(
        ListRelayPairedHostsResponse { hosts },
    )))
}

pub async fn remove_relay_paired_host(
    State(deployment): State<DeploymentImpl>,
    Path(host_id): Path<Uuid>,
) -> Response {
    let relay_hosts = match deployment.relay_hosts() {
        Ok(relay_hosts) => relay_hosts,
        Err(error) => return ApiError::from(error).into_response(),
    };

    match relay_hosts.remove_host(host_id).await {
        Ok(removed) => (
            StatusCode::OK,
            Json(ApiResponse::<RemoveRelayPairedHostResponse>::success(
                RemoveRelayPairedHostResponse { removed },
            )),
        )
            .into_response(),
        Err(error) => {
            tracing::error!(?error, %host_id, "Failed to remove paired relay host");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<RemoveRelayPairedHostResponse>::error(
                    "Failed to remove paired relay host",
                )),
            )
                .into_response()
        }
    }
}

fn map_pair_relay_host_error(host_id: Uuid, error: RelayPairingClientError) -> Response {
    match error {
        RelayPairingClientError::NotConfigured => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<PairRelayHostResponse>::error(
                "Remote relay API is not configured",
            )),
        )
            .into_response(),
        RelayPairingClientError::Authentication(error) => {
            tracing::warn!(?error, %host_id, "Failed to authenticate relay host pairing");
            (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<PairRelayHostResponse>::error(
                    "Failed to authenticate relay host pairing",
                )),
            )
                .into_response()
        }
        RelayPairingClientError::Pairing(error) => {
            tracing::warn!(?error, %host_id, "Failed to pair relay host");
            (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<PairRelayHostResponse>::error(
                    &error.to_string(),
                )),
            )
                .into_response()
        }
        RelayPairingClientError::Store(error) => {
            tracing::error!(?error, %host_id, "Failed to persist paired relay host credentials");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<PairRelayHostResponse>::error(
                    "Failed to persist paired relay host credentials",
                )),
            )
                .into_response()
        }
    }
}
