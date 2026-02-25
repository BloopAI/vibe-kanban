use std::{net::SocketAddr, time::Duration};

use axum::{
    Router,
    extract::{ConnectInfo, Json as ExtractJson, State},
    response::{Html, Json as ResponseJson},
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use serde::{Deserialize, Serialize};
use trusted_key_auth::{
    TRUSTED_KEYS_FILE_NAME, TrustedKeyAuthError, add_trusted_public_key, parse_public_key_base64,
    spake2::{
        build_server_proof_base64, generate_one_time_code, start_spake2_enrollment,
        verify_client_proof,
    },
};
use utils::{assets::asset_dir, response::ApiResponse};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(60);
const GENERATE_CODE_GLOBAL_LIMIT: usize = 5;
const SPAKE2_START_GLOBAL_LIMIT: usize = 30;

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
    added: bool,
    server_proof_b64: String,
}

#[derive(Debug, Serialize)]
struct GenerateEnrollmentCodeResponse {
    enrollment_code: String,
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/auth/trusted-keys/spake2/test-page", get(spake2_test_page))
        .route(
            "/auth/trusted-keys/enrollment-code",
            post(generate_enrollment_code),
        )
        .route(
            "/auth/trusted-keys/spake2/start",
            post(start_spake2_enrollment_route),
        )
        .route(
            "/auth/trusted-keys/spake2/finish",
            post(finish_spake2_enrollment),
        )
}

async fn spake2_test_page() -> Html<&'static str> {
    Html(include_str!("auth_spake2_test_page.html"))
}

async fn generate_enrollment_code(
    State(deployment): State<DeploymentImpl>,
    ConnectInfo(client_addr): ConnectInfo<SocketAddr>,
) -> Result<ResponseJson<ApiResponse<GenerateEnrollmentCodeResponse>>, ApiError> {
    ensure_loopback_only(&client_addr)?;

    enforce_rate_limit(
        &deployment,
        "trusted-keys:code-generation:global",
        GENERATE_CODE_GLOBAL_LIMIT,
        RATE_LIMIT_WINDOW,
    )
    .await?;

    let enrollment_code = deployment
        .get_or_set_enrollment_code(generate_one_time_code())
        .await;

    tracing::info!(
        client_ip = %client_addr.ip(),
        "Issued trusted-key enrollment code"
    );

    Ok(ResponseJson(ApiResponse::success(
        GenerateEnrollmentCodeResponse { enrollment_code },
    )))
}

async fn start_spake2_enrollment_route(
    State(deployment): State<DeploymentImpl>,
    ConnectInfo(client_addr): ConnectInfo<SocketAddr>,
    ExtractJson(payload): ExtractJson<StartSpake2EnrollmentRequest>,
) -> Result<ResponseJson<ApiResponse<StartSpake2EnrollmentResponse>>, ApiError> {
    enforce_rate_limit(
        &deployment,
        "trusted-keys:spake2-start:global",
        SPAKE2_START_GLOBAL_LIMIT,
        RATE_LIMIT_WINDOW,
    )
    .await?;

    let spake2_start = start_spake2_enrollment(
        &payload.enrollment_code,
        &payload.client_message_b64,
    )
    .map_err(|error| {
        if matches!(error, TrustedKeyAuthError::Unauthorized) {
            tracing::info!(
                "Rejecting SPAKE2 enrollment start: client SPAKE2 message failed verification"
            );
        }
        ApiError::from(error)
    })?;

    if !deployment
        .consume_enrollment_code(&spake2_start.enrollment_code)
        .await
    {
        tracing::info!(
            client_ip = %client_addr.ip(),
            "Rejecting SPAKE2 enrollment start: missing or invalid enrollment code"
        );
        return Err(ApiError::Unauthorized);
    }

    let enrollment_id = Uuid::new_v4();
    deployment
        .store_pake_enrollment(enrollment_id, spake2_start.shared_key)
        .await;
    tracing::info!(
        enrollment_id = %enrollment_id,
        "Started SPAKE2 trusted-key enrollment session"
    );

    Ok(ResponseJson(ApiResponse::success(
        StartSpake2EnrollmentResponse {
            enrollment_id,
            server_message_b64: spake2_start.server_message_b64,
        },
    )))
}

async fn finish_spake2_enrollment(
    State(deployment): State<DeploymentImpl>,
    ExtractJson(payload): ExtractJson<FinishSpake2EnrollmentRequest>,
) -> Result<ResponseJson<ApiResponse<FinishSpake2EnrollmentResponse>>, ApiError> {
    let Some(shared_key) = deployment
        .take_pake_enrollment(&payload.enrollment_id)
        .await
    else {
        tracing::info!(
            enrollment_id = %payload.enrollment_id,
            "Rejecting SPAKE2 enrollment finish: enrollment session was missing or expired"
        );
        return Err(ApiError::Unauthorized);
    };

    let public_key = parse_public_key_base64(&payload.public_key_b64)
        .map_err(|_| ApiError::BadRequest("Invalid public_key_b64".to_string()))?;
    verify_client_proof(
        &shared_key,
        &payload.enrollment_id,
        &public_key,
        &payload.client_proof_b64,
    )
    .map_err(|error| {
        if matches!(error, TrustedKeyAuthError::Unauthorized) {
            tracing::info!(
                enrollment_id = %payload.enrollment_id,
                "Rejecting SPAKE2 enrollment finish: invalid client proof"
            );
        }
        ApiError::from(error)
    })?;

    let canonical_public_key_b64 = BASE64_STANDARD.encode(public_key.as_bytes());
    let trusted_keys_path = asset_dir().join(TRUSTED_KEYS_FILE_NAME);
    let added = add_trusted_public_key(&trusted_keys_path, &canonical_public_key_b64).await?;
    let server_proof_b64 =
        build_server_proof_base64(&shared_key, &payload.enrollment_id, &public_key)?;

    tracing::info!(
        enrollment_id = %payload.enrollment_id,
        added,
        "Completed SPAKE2 enrollment and processed trusted key"
    );

    Ok(ResponseJson(ApiResponse::success(
        FinishSpake2EnrollmentResponse {
            added,
            server_proof_b64,
        },
    )))
}

fn ensure_loopback_only(client_addr: &SocketAddr) -> Result<(), ApiError> {
    if client_addr.ip().is_loopback() {
        return Ok(());
    }

    Err(ApiError::Forbidden(
        "Enrollment code endpoint is only available from loopback addresses.".to_string(),
    ))
}

async fn enforce_rate_limit(
    deployment: &DeploymentImpl,
    bucket: &str,
    max_requests: usize,
    window: Duration,
) -> Result<(), ApiError> {
    if deployment
        .allow_rate_limited_action(bucket, max_requests, window)
        .await
    {
        return Ok(());
    }

    tracing::info!(
        bucket,
        max_requests,
        window_seconds = window.as_secs(),
        "Rate limit exceeded for trusted-key enrollment endpoint"
    );
    Err(ApiError::TooManyRequests(
        "Too many requests. Please wait and try again.".to_string(),
    ))
}
