use anyhow::Context as _;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use chrono::Utc;
use deployment::Deployment;
use relay_client::RelayApiClient;
use relay_types::{
    ListRelayPairedHostsResponse, PairRelayHostRequest, PairRelayHostResponse, RelayPairedHost,
    RemoveRelayPairedHostResponse,
};
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::DeploymentImpl;

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
    let paired_credentials = match pair_relay_host_credentials(&deployment, &req).await {
        Ok(credentials) => credentials,
        Err(error) => {
            tracing::warn!(?error, host_id = %req.host_id, "Failed to pair relay host");
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<PairRelayHostResponse>::error(
                    &error.to_string(),
                )),
            )
                .into_response();
        }
    };
    let relay_client::PairRelayHostResult {
        signing_session_id,
        client_id,
        server_public_key_b64,
    } = paired_credentials;

    match deployment
        .upsert_relay_host_credentials(
            req.host_id,
            Some(req.host_name.clone()),
            Some(Utc::now().to_rfc3339()),
            Some(client_id.to_string()),
            Some(server_public_key_b64),
        )
        .await
    {
        Ok(()) => {
            deployment
                .cache_relay_signing_session_id(req.host_id, signing_session_id.to_string())
                .await;
            (
                StatusCode::OK,
                Json(ApiResponse::<PairRelayHostResponse>::success(
                    PairRelayHostResponse { paired: true },
                )),
            )
                .into_response()
        }
        Err(error) => {
            tracing::error!(?error, "Failed to persist paired relay host credentials");
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

pub async fn list_relay_paired_hosts(State(deployment): State<DeploymentImpl>) -> Response {
    let mut hosts = deployment
        .list_relay_host_credentials_summary()
        .await
        .into_iter()
        .map(|value| RelayPairedHost {
            host_id: value.host_id,
            host_name: value.host_name,
            paired_at: value.paired_at,
        })
        .collect::<Vec<_>>();

    hosts.sort_by(|a, b| b.paired_at.cmp(&a.paired_at));

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
    match deployment.remove_relay_host_credentials(host_id).await {
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

async fn pair_relay_host_credentials(
    deployment: &DeploymentImpl,
    req: &PairRelayHostRequest,
) -> anyhow::Result<relay_client::PairRelayHostResult> {
    let remote_client = deployment.remote_client()?;
    let access_token = remote_client
        .access_token()
        .await
        .context("Failed to get access token for relay auth code")?;
    let relay_base_url = deployment
        .shared_api_base()
        .ok_or_else(|| anyhow::anyhow!("VK_SHARED_RELAY_API_BASE is not configured"))?;
    let relay_client = RelayApiClient::new(relay_base_url, access_token);
    let signing_key = deployment.relay_signing().signing_key().clone();
    relay_client.pair_host(req, &signing_key).await
}
