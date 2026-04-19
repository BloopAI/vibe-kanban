use std::sync::Arc;

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    routing::{delete, get, post},
};
use db::p2p_hosts::{self, CreateP2pHostParams};
use deployment::Deployment;
use rand::Rng;
use serde::{Deserialize, Serialize};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError, p2p::PairingStore};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAIRING_CHARSET: &[u8] = b"23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";

fn generate_pairing_code() -> String {
    let mut rng = rand::thread_rng();
    (0..8)
        .map(|_| PAIRING_CHARSET[rng.gen_range(0..PAIRING_CHARSET.len())] as char)
        .collect()
}

fn generate_session_token() -> String {
    uuid::Uuid::new_v4().to_string().replace('-', "")
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router(pairing_store: Arc<PairingStore>) -> Router<DeploymentImpl> {
    Router::new()
        .route("/p2p/hosts", get(list_hosts))
        .route("/p2p/hosts/{id}", delete(remove_host))
        .route("/p2p/enrollment-code", post(create_enrollment_code))
        .route("/p2p/pair", post(pair_host))
        .layer(Extension(pairing_store))
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct EnrollmentCodeResponse {
    code: String,
}

#[derive(Debug, Serialize)]
struct PairResponse {
    session_token: String,
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct PairRequest {
    code: String,
    name: String,
    address: String,
    relay_port: i64,
    machine_id: String,
    caller_address: String,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn list_hosts(
    State(deployment): State<DeploymentImpl>,
) -> Result<Json<ApiResponse<Vec<db::p2p_hosts::P2pHost>>>, ApiError> {
    let hosts = p2p_hosts::list_p2p_hosts(deployment.db()).await?;
    Ok(Json(ApiResponse::success(hosts)))
}

async fn remove_host(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<bool>>, ApiError> {
    let deleted = p2p_hosts::delete_p2p_host(deployment.db(), &id).await?;
    Ok(Json(ApiResponse::success(deleted)))
}

async fn create_enrollment_code(
    Extension(pairing_store): Extension<Arc<PairingStore>>,
) -> Result<Json<ApiResponse<EnrollmentCodeResponse>>, ApiError> {
    let code = generate_pairing_code();
    pairing_store.set_pending_code(code.clone(), 5);
    Ok(Json(ApiResponse::success(EnrollmentCodeResponse { code })))
}

async fn pair_host(
    State(deployment): State<DeploymentImpl>,
    Extension(pairing_store): Extension<Arc<PairingStore>>,
    Json(req): Json<PairRequest>,
) -> Result<Json<ApiResponse<PairResponse>>, ApiError> {
    // Rate-limit: at most 5 attempts per IP in the last 15 minutes.
    let attempts =
        p2p_hosts::count_recent_pairing_attempts(deployment.db(), &req.caller_address, 15).await?;
    if attempts >= 5 {
        return Err(ApiError::TooManyRequests(
            "Too many pairing attempts. Please wait before trying again.".to_string(),
        ));
    }

    // Validate and consume the single-use pairing code.
    if !pairing_store.consume_code(&req.code) {
        p2p_hosts::record_pairing_attempt(deployment.db(), &req.caller_address, false).await?;
        return Err(ApiError::Unauthorized);
    }

    // Persist the new host row.
    let host = p2p_hosts::create_p2p_host(
        deployment.db(),
        CreateP2pHostParams {
            name: req.name,
            address: req.address,
            relay_port: req.relay_port,
            machine_id: req.machine_id,
        },
    )
    .await?;

    // Mark the host as paired and store the session token.
    let session_token = generate_session_token();
    p2p_hosts::update_p2p_host_paired(deployment.db(), &host.id, &session_token).await?;

    // Record successful attempt for audit purposes.
    p2p_hosts::record_pairing_attempt(deployment.db(), &req.caller_address, true).await?;

    Ok(Json(ApiResponse::success(PairResponse { session_token })))
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pairing_code_length() {
        let code = generate_pairing_code();
        assert_eq!(code.len(), 8, "pairing code must be exactly 8 characters");
    }

    #[test]
    fn test_pairing_code_charset() {
        let charset: std::collections::HashSet<char> =
            PAIRING_CHARSET.iter().map(|&b| b as char).collect();
        for _ in 0..100 {
            let code = generate_pairing_code();
            for ch in code.chars() {
                assert!(
                    charset.contains(&ch),
                    "character '{ch}' is not in the pairing charset"
                );
            }
        }
    }

    #[test]
    fn test_pairing_code_uniqueness() {
        let codes: std::collections::HashSet<String> =
            (0..20).map(|_| generate_pairing_code()).collect();
        assert!(codes.len() > 1, "consecutive pairing codes should differ");
    }

    #[test]
    fn test_session_token_length() {
        let token = generate_session_token();
        assert_eq!(
            token.len(),
            32,
            "session token must be 32 hex chars (UUID without dashes)"
        );
    }

    #[test]
    fn test_session_token_no_dashes() {
        let token = generate_session_token();
        assert!(
            !token.contains('-'),
            "session token must not contain dashes"
        );
    }
}
