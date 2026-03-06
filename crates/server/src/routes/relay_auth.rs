use std::time::Duration;

use axum::{
    Json, Router,
    extract::{Json as ExtractJson, Path, State},
    http::HeaderMap,
    routing::{delete, get, post},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use trusted_key_auth::{
    key_confirmation::{build_server_proof, verify_client_proof},
    refresh::{build_refresh_message, validate_refresh_timestamp, verify_refresh_signature},
    spake2::{generate_one_time_code, start_spake2_enrollment},
    trusted_keys::{TrustedRelayClient, parse_public_key_base64},
};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(60);
const GENERATE_CODE_GLOBAL_LIMIT: usize = 5;
const SPAKE2_START_GLOBAL_LIMIT: usize = 30;
const SIGNING_SESSION_REFRESH_GLOBAL_LIMIT: usize = 30;
const RELAY_HEADER: &str = "x-vk-relayed";

#[derive(Debug, Serialize)]
struct GenerateEnrollmentCodeResponse {
    enrollment_code: String,
}

#[derive(Debug, Deserialize, TS)]
pub struct StartSpake2EnrollmentRequest {
    enrollment_code: String,
    client_message_b64: String,
}

#[derive(Debug, Serialize, TS)]
pub struct StartSpake2EnrollmentResponse {
    enrollment_id: Uuid,
    server_message_b64: String,
}

#[derive(Debug, Deserialize, TS)]
pub struct FinishSpake2EnrollmentRequest {
    enrollment_id: Uuid,
    client_id: Uuid,
    client_name: String,
    client_browser: String,
    client_os: String,
    client_device: String,
    public_key_b64: String,
    client_proof_b64: String,
}

#[derive(Debug, Serialize, TS)]
pub struct FinishSpake2EnrollmentResponse {
    signing_session_id: Uuid,
    server_public_key_b64: String,
    server_proof_b64: String,
}

#[derive(Debug, Serialize, TS)]
pub struct RelayPairedClient {
    client_id: Uuid,
    client_name: String,
    client_browser: String,
    client_os: String,
    client_device: String,
}

#[derive(Debug, Serialize, TS)]
pub struct ListRelayPairedClientsResponse {
    clients: Vec<RelayPairedClient>,
}

#[derive(Debug, Serialize, TS)]
pub struct RemoveRelayPairedClientResponse {
    removed: bool,
}

#[derive(Debug, Deserialize, TS)]
pub struct RefreshRelaySigningSessionRequest {
    client_id: Uuid,
    timestamp: i64,
    nonce: String,
    signature_b64: String,
}

#[derive(Debug, Serialize, TS)]
pub struct RefreshRelaySigningSessionResponse {
    signing_session_id: Uuid,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route(
            "/relay-auth/enrollment-code",
            post(generate_enrollment_code),
        )
        .route("/relay-auth/clients", get(list_relay_paired_clients))
        .route(
            "/relay-auth/clients/{client_id}",
            delete(remove_relay_paired_client),
        )
        .route(
            "/relay-auth/spake2/start",
            post(start_spake2_enrollment_route),
        )
        .route("/relay-auth/spake2/finish", post(finish_spake2_enrollment))
        .route(
            "/relay-auth/signing-session/refresh",
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

    deployment
        .trusted_key_auth()
        .enforce_rate_limit(
            "relay-auth:code-generation:global",
            GENERATE_CODE_GLOBAL_LIMIT,
            RATE_LIMIT_WINDOW,
        )
        .await?;

    let enrollment_code = deployment
        .trusted_key_auth()
        .get_or_set_enrollment_code(generate_one_time_code())
        .await;

    Ok(Json(ApiResponse::success(GenerateEnrollmentCodeResponse {
        enrollment_code,
    })))
}

async fn start_spake2_enrollment_route(
    State(deployment): State<DeploymentImpl>,
    ExtractJson(payload): ExtractJson<StartSpake2EnrollmentRequest>,
) -> Result<Json<ApiResponse<StartSpake2EnrollmentResponse>>, ApiError> {
    deployment
        .trusted_key_auth()
        .enforce_rate_limit(
            "relay-auth:spake2-start:global",
            SPAKE2_START_GLOBAL_LIMIT,
            RATE_LIMIT_WINDOW,
        )
        .await?;

    let spake2_start =
        start_spake2_enrollment(&payload.enrollment_code, &payload.client_message_b64)?;

    if !deployment
        .trusted_key_auth()
        .consume_enrollment_code(&spake2_start.enrollment_code)
        .await
    {
        return Err(ApiError::Unauthorized);
    }

    let enrollment_id = Uuid::new_v4();
    deployment
        .trusted_key_auth()
        .store_pake_enrollment(enrollment_id, spake2_start.shared_key)
        .await;

    Ok(Json(ApiResponse::success(StartSpake2EnrollmentResponse {
        enrollment_id,
        server_message_b64: spake2_start.server_message_b64,
    })))
}

async fn list_relay_paired_clients(
    State(deployment): State<DeploymentImpl>,
) -> Result<Json<ApiResponse<ListRelayPairedClientsResponse>>, ApiError> {
    let clients = deployment.trusted_key_auth().list_trusted_clients().await?;
    let clients = clients
        .into_iter()
        .map(|client| RelayPairedClient {
            client_id: client.client_id,
            client_name: client.client_name,
            client_browser: client.client_browser,
            client_os: client.client_os,
            client_device: client.client_device,
        })
        .collect();

    Ok(Json(ApiResponse::success(ListRelayPairedClientsResponse {
        clients,
    })))
}

async fn remove_relay_paired_client(
    State(deployment): State<DeploymentImpl>,
    Path(client_id): Path<Uuid>,
) -> Result<Json<ApiResponse<RemoveRelayPairedClientResponse>>, ApiError> {
    let removed = deployment
        .trusted_key_auth()
        .remove_trusted_client(client_id)
        .await?;

    Ok(Json(ApiResponse::success(
        RemoveRelayPairedClientResponse { removed },
    )))
}

async fn finish_spake2_enrollment(
    State(deployment): State<DeploymentImpl>,
    ExtractJson(payload): ExtractJson<FinishSpake2EnrollmentRequest>,
) -> Result<Json<ApiResponse<FinishSpake2EnrollmentResponse>>, ApiError> {
    let Some(shared_key) = deployment
        .trusted_key_auth()
        .take_pake_enrollment(&payload.enrollment_id)
        .await
    else {
        return Err(ApiError::Unauthorized);
    };

    let browser_public_key = parse_public_key_base64(&payload.public_key_b64)
        .map_err(|_| ApiError::BadRequest("Invalid public_key_b64".to_string()))?;

    let server_public_key = deployment.relay_signing().server_public_key();
    let server_public_key_b64 = BASE64_STANDARD.encode(server_public_key.as_bytes());

    verify_client_proof(
        &shared_key,
        &payload.enrollment_id,
        browser_public_key.as_bytes(),
        &payload.client_proof_b64,
    )
    .map_err(|_| ApiError::Unauthorized)?;

    // Persist the browser's public key so it survives server restarts
    if let Err(e) = deployment
        .trusted_key_auth()
        .persist_trusted_client(TrustedRelayClient {
            client_id: payload.client_id,
            client_name: payload.client_name.clone(),
            client_browser: payload.client_browser.clone(),
            client_os: payload.client_os.clone(),
            client_device: payload.client_device.clone(),
            public_key_b64: payload.public_key_b64.clone(),
        })
        .await
    {
        tracing::warn!(?e, "Failed to persist trusted relay client");
    }

    let signing_session_id = deployment
        .relay_signing()
        .create_session(browser_public_key)
        .await;

    let server_proof_b64 = build_server_proof(
        &shared_key,
        &payload.enrollment_id,
        browser_public_key.as_bytes(),
        server_public_key.as_bytes(),
    )
    .map_err(|_| ApiError::Unauthorized)?;

    tracing::info!(
        enrollment_id = %payload.enrollment_id,
        client_id = %payload.client_id,
        signing_session_id = %signing_session_id,
        public_key_b64 = %BASE64_STANDARD.encode(browser_public_key.as_bytes()),
        "completed relay PAKE enrollment"
    );

    deployment
        .track_if_analytics_allowed(
            "relay_host_paired",
            serde_json::json!({
                "client_id": payload.client_id,
                "client_browser": payload.client_browser,
                "client_os": payload.client_os,
                "client_device": payload.client_device,
            }),
        )
        .await;

    Ok(Json(ApiResponse::success(FinishSpake2EnrollmentResponse {
        signing_session_id,
        server_public_key_b64,
        server_proof_b64,
    })))
}

async fn refresh_relay_signing_session(
    State(deployment): State<DeploymentImpl>,
    ExtractJson(payload): ExtractJson<RefreshRelaySigningSessionRequest>,
) -> Result<Json<ApiResponse<RefreshRelaySigningSessionResponse>>, ApiError> {
    deployment
        .trusted_key_auth()
        .enforce_rate_limit(
            "relay-auth:signing-refresh:global",
            SIGNING_SESSION_REFRESH_GLOBAL_LIMIT,
            RATE_LIMIT_WINDOW,
        )
        .await?;

    let trusted_client = deployment
        .trusted_key_auth()
        .find_trusted_client(payload.client_id)
        .await?
        .ok_or(ApiError::Unauthorized)?;

    let browser_public_key = parse_public_key_base64(&trusted_client.public_key_b64)
        .map_err(|_| ApiError::Unauthorized)?;

    validate_refresh_timestamp(payload.timestamp)?;
    deployment
        .trusted_key_auth()
        .claim_refresh_nonce(&payload.nonce)
        .await?;

    let refresh_message =
        build_refresh_message(payload.timestamp, &payload.nonce, payload.client_id);
    verify_refresh_signature(
        &browser_public_key,
        &refresh_message,
        &payload.signature_b64,
    )?;

    let signing_session_id = deployment
        .relay_signing()
        .create_session(browser_public_key)
        .await;

    Ok(Json(ApiResponse::success(
        RefreshRelaySigningSessionResponse { signing_session_id },
    )))
}

fn is_relay_request(headers: &HeaderMap) -> bool {
    headers
        .get(RELAY_HEADER)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.trim() == "1")
}
