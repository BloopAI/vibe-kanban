use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use relay_types::{
    ListRelayPairedHostsResponse, PairRelayHostRequest, PairRelayHostResponse,
    RemoveRelayPairedHostResponse,
};
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    relay_pairing::{build_relay_pairing_client, client::RelayPairingClientError},
};

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
    let client = build_relay_pairing_client(&deployment);

    match client.pair_host(&req).await {
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

pub async fn list_relay_paired_hosts(State(deployment): State<DeploymentImpl>) -> Response {
    let client = build_relay_pairing_client(&deployment);
    let hosts = client.list_hosts().await;

    (
        StatusCode::OK,
        Json(ApiResponse::<ListRelayPairedHostsResponse>::success(
            ListRelayPairedHostsResponse { hosts },
        )),
    )
        .into_response()
}

pub async fn remove_relay_paired_host(
    State(deployment): State<DeploymentImpl>,
    Path(host_id): Path<Uuid>,
) -> Response {
    let client = build_relay_pairing_client(&deployment);

    match client.remove_host(host_id).await {
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
