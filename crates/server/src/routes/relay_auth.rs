use std::time::Duration;

use axum::{
    Json, Router,
    extract::{Json as ExtractJson, State},
    http::HeaderMap,
    routing::post,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use deployment::Deployment;
use ed25519_dalek::SigningKey;
use serde::{Deserialize, Serialize};
use trusted_key_auth::{
    TrustedKeyAuthError, add_trusted_public_key,
    key_confirmation::{build_server_proof, verify_client_proof},
    spake2::{generate_one_time_code, start_spake2_enrollment},
    trusted_keys::parse_public_key_base64,
};
use utils::{assets::trusted_keys_path, response::ApiResponse};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(60);
const GENERATE_CODE_GLOBAL_LIMIT: usize = 5;
const SPAKE2_START_GLOBAL_LIMIT: usize = 30;
const RELAY_HEADER: &str = "x-vk-relayed";

#[derive(Debug, Serialize)]
struct GenerateEnrollmentCodeResponse {
    enrollment_code: String,
}

#[derive(Debug, Deserialize)]
struct StartSpake2EnrollmentRequest {
    enrollment_code: String,
    client_message_b64: String,
}

#[derive(Debug, Serialize)]
struct StartSpake2EnrollmentResponse {
    enrollment_id: Uuid,
    server_message_b64: String,
}

#[derive(Debug, Deserialize)]
struct FinishSpake2EnrollmentRequest {
    enrollment_id: Uuid,
    public_key_b64: String,
    client_proof_b64: String,
}

#[derive(Debug, Serialize)]
struct FinishSpake2EnrollmentResponse {
    signing_session_id: Uuid,
    server_public_key_b64: String,
    server_proof_b64: String,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route(
            "/relay-auth/enrollment-code",
            post(generate_enrollment_code),
        )
        .route(
            "/relay-auth/spake2/start",
            post(start_spake2_enrollment_route),
        )
        .route("/relay-auth/spake2/finish", post(finish_spake2_enrollment))
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

    enforce_rate_limit(
        &deployment,
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
    enforce_rate_limit(
        &deployment,
        "relay-auth:spake2-start:global",
        SPAKE2_START_GLOBAL_LIMIT,
        RATE_LIMIT_WINDOW,
    )
    .await?;

    let spake2_start =
        start_spake2_enrollment(&payload.enrollment_code, &payload.client_message_b64).map_err(
            |error| match error {
                TrustedKeyAuthError::Unauthorized => ApiError::Unauthorized,
                other => ApiError::BadRequest(other.to_string()),
            },
        )?;

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

    let server_signing_key = SigningKey::generate(&mut rand::thread_rng());
    let server_public_key = server_signing_key.verifying_key();
    let server_public_key_b64 = BASE64_STANDARD.encode(server_public_key.as_bytes());

    verify_client_proof(
        &shared_key,
        &payload.enrollment_id,
        browser_public_key.as_bytes(),
        &payload.client_proof_b64,
    )
    .map_err(|_| ApiError::Unauthorized)?;

    // Persist the browser's public key so it survives server restarts
    if let Err(e) = add_trusted_public_key(&trusted_keys_path(), &payload.public_key_b64).await {
        tracing::warn!(?e, "Failed to persist trusted public key");
    }

    let signing_session_id = deployment
        .relay_signing()
        .create_session(browser_public_key, server_signing_key)
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
        signing_session_id = %signing_session_id,
        public_key_b64 = %BASE64_STANDARD.encode(browser_public_key.as_bytes()),
        "completed relay PAKE enrollment"
    );

    Ok(Json(ApiResponse::success(FinishSpake2EnrollmentResponse {
        signing_session_id,
        server_public_key_b64,
        server_proof_b64,
    })))
}

async fn enforce_rate_limit(
    deployment: &DeploymentImpl,
    bucket: &str,
    max_requests: usize,
    window: Duration,
) -> Result<(), ApiError> {
    if deployment
        .trusted_key_auth()
        .allow_rate_limited_action(bucket, max_requests, window)
        .await
    {
        return Ok(());
    }

    Err(ApiError::TooManyRequests(
        "Too many requests. Please wait and try again.".to_string(),
    ))
}

fn is_relay_request(headers: &HeaderMap) -> bool {
    headers
        .get(RELAY_HEADER)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.trim() == "1")
}
