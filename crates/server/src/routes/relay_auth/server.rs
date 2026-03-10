use axum::{
    Json, Router,
    extract::{Json as ExtractJson, Path, State},
    http::HeaderMap,
    routing::{delete, get, post},
};
use relay_types::{
    FinishSpake2EnrollmentRequest, FinishSpake2EnrollmentResponse, ListRelayPairedClientsResponse,
    RefreshRelaySigningSessionRequest, RefreshRelaySigningSessionResponse,
    RemoveRelayPairedClientResponse, StartSpake2EnrollmentRequest, StartSpake2EnrollmentResponse,
};
use serde::Serialize;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    error::ApiError,
    relay_pairing::{build_relay_pairing_server, server::is_relay_request},
};

#[derive(Debug, Serialize)]
struct GenerateEnrollmentCodeResponse {
    enrollment_code: String,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route(
            "/relay-auth/server/enrollment-code",
            post(generate_enrollment_code),
        )
        .route("/relay-auth/server/clients", get(list_relay_paired_clients))
        .route(
            "/relay-auth/server/clients/{client_id}",
            delete(remove_relay_paired_client),
        )
        .route(
            "/relay-auth/server/spake2/start",
            post(start_spake2_enrollment_route),
        )
        .route(
            "/relay-auth/server/spake2/finish",
            post(finish_spake2_enrollment),
        )
        .route(
            "/relay-auth/server/signing-session/refresh",
            post(refresh_relay_signing_session),
        )
}

async fn generate_enrollment_code(
    State(deployment): State<DeploymentImpl>,
    headers: HeaderMap,
) -> Result<Json<ApiResponse<GenerateEnrollmentCodeResponse>>, ApiError> {
    if is_relay_request(&headers) {
        return Err(ApiError::Forbidden(
            "Enrollment code cannot be fetched over relay.".to_string(),
        ));
    }

    let enrollment_code = build_relay_pairing_server(&deployment)
        .generate_enrollment_code()
        .await?;

    Ok(Json(ApiResponse::success(GenerateEnrollmentCodeResponse {
        enrollment_code,
    })))
}

async fn start_spake2_enrollment_route(
    State(deployment): State<DeploymentImpl>,
    ExtractJson(payload): ExtractJson<StartSpake2EnrollmentRequest>,
) -> Result<Json<ApiResponse<StartSpake2EnrollmentResponse>>, ApiError> {
    let response = build_relay_pairing_server(&deployment)
        .start_spake2_enrollment(payload)
        .await?;

    Ok(Json(ApiResponse::success(response)))
}

async fn list_relay_paired_clients(
    State(deployment): State<DeploymentImpl>,
) -> Result<Json<ApiResponse<ListRelayPairedClientsResponse>>, ApiError> {
    let clients = build_relay_pairing_server(&deployment)
        .list_paired_clients()
        .await?;

    Ok(Json(ApiResponse::success(ListRelayPairedClientsResponse {
        clients,
    })))
}

async fn remove_relay_paired_client(
    State(deployment): State<DeploymentImpl>,
    Path(client_id): Path<Uuid>,
) -> Result<Json<ApiResponse<RemoveRelayPairedClientResponse>>, ApiError> {
    let removed = build_relay_pairing_server(&deployment)
        .remove_paired_client(client_id)
        .await?;

    Ok(Json(ApiResponse::success(
        RemoveRelayPairedClientResponse { removed },
    )))
}

async fn finish_spake2_enrollment(
    State(deployment): State<DeploymentImpl>,
    ExtractJson(payload): ExtractJson<FinishSpake2EnrollmentRequest>,
) -> Result<Json<ApiResponse<FinishSpake2EnrollmentResponse>>, ApiError> {
    let response = build_relay_pairing_server(&deployment)
        .finish_spake2_enrollment(payload)
        .await?;

    Ok(Json(ApiResponse::success(response)))
}

async fn refresh_relay_signing_session(
    State(deployment): State<DeploymentImpl>,
    ExtractJson(payload): ExtractJson<RefreshRelaySigningSessionRequest>,
) -> Result<Json<ApiResponse<RefreshRelaySigningSessionResponse>>, ApiError> {
    let response = build_relay_pairing_server(&deployment)
        .refresh_signing_session(payload)
        .await?;

    Ok(Json(ApiResponse::success(response)))
}
