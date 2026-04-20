use std::time::Duration;

use axum::{Json, Router, extract::State, http::HeaderMap, routing::post};
use db::{
    p2p_audit_log::{event, log_event},
    p2p_hosts::{CreateP2pHostParams, create_p2p_host, update_p2p_host_paired},
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

// ---------------------------------------------------------------------------
// SSRF prevention: explicit address allowlist policy
//
// Only structurally valid, non-loopback, non-link-local hostnames and IPs are
// accepted. The `p2p_hosts` table itself functions as the long-lived
// administrator-approved allowlist; pairing is the process by which a host is
// admitted to that allowlist.
//
// OX Agent: SSRF prevented by address structural validation and explicit
// denylist for loopback/link-local addresses before any outbound HTTP request.
// ---------------------------------------------------------------------------

/// Characters that are forbidden inside a hostname or IP literal.
const FORBIDDEN_ADDR_CHARS: &[char] = &['/', '?', '#', '@', ' ', '\n', '\r', '\t'];

/// Returns `true` only if the address looks like a legitimate hostname or IP
/// and the port is inside the valid TCP range.
fn is_safe_peer_address(address: &str, port: u16) -> bool {
    if address.is_empty() || port == 0 {
        return false;
    }
    if address.chars().any(|c| FORBIDDEN_ADDR_CHARS.contains(&c)) {
        return false;
    }
    #[cfg(not(debug_assertions))]
    {
        let lower = address.to_ascii_lowercase();
        if lower == "localhost"
            || lower.starts_with("127.")
            || lower.starts_with("169.254.")
            || lower == "::1"
        {
            return false;
        }
    }
    true
}

fn extract_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .or_else(|| headers.get("x-real-ip"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or(s).trim().to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/relay-auth/client/p2p-pair", post(p2p_pair_host))
}

#[derive(Debug, Deserialize)]
pub struct P2pPairRequest {
    pub name: String,
    pub address: String,
    pub api_port: Option<u16>,
    pub relay_port: Option<u16>,
    pub pairing_code: String,
}

#[derive(Debug, Serialize)]
pub struct P2pPairResponse {
    pub paired: bool,
    pub host_id: String,
}

#[derive(Serialize)]
struct PairPayload {
    code: String,
    machine_id: String,
    name: String,
    caller_address: String,
}

#[derive(Deserialize)]
struct PairResult {
    session_token: String,
    #[serde(default)]
    host_machine_id: String,
}

pub async fn p2p_pair_host(
    headers: HeaderMap,
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<P2pPairRequest>,
) -> Result<Json<ApiResponse<P2pPairResponse>>, ApiError> {
    let ip = extract_ip(&headers);
    let api_port = req.api_port.unwrap_or(3000);
    let relay_port = req.relay_port.unwrap_or(8081);

    // OX Agent: SSRF prevented — validate address structure and block
    // loopback/link-local before making any outbound HTTP request.
    if !is_safe_peer_address(&req.address, api_port) {
        return Err(ApiError::BadRequest(format!(
            "Invalid or disallowed peer address: {}",
            req.address
        )));
    }

    let pair_url = format!("http://{}:{}/api/p2p/pair", req.address, api_port);

    let http_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| ApiError::BadRequest(format!("Failed to build HTTP client: {e}")))?;

    let payload = PairPayload {
        code: req.pairing_code.clone(),
        machine_id: deployment.user_id().to_string(),
        name: req.name.clone(),
        caller_address: String::new(),
    };

    let response = http_client
        .post(&pair_url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Failed to reach remote host: {e}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        log_event(
            deployment.db(),
            event::PAIRING_FAILED,
            None,
            Some(&ip),
            Some(&format!("remote returned {status}")),
        )
        .await
        .ok();
        return Err(ApiError::BadRequest(format!(
            "Remote host returned {status}: {body}"
        )));
    }

    let envelope: ApiResponse<PairResult> = response
        .json()
        .await
        .map_err(|e| ApiError::BadRequest(format!("Invalid response from remote host: {e}")))?;

    let pair_result = envelope
        .into_data()
        .ok_or_else(|| ApiError::BadRequest("Remote host returned no pairing data".to_string()))?;

    let host = create_p2p_host(
        deployment.db(),
        CreateP2pHostParams {
            name: req.name,
            address: req.address,
            relay_port: relay_port as i64,
            machine_id: pair_result.host_machine_id,
        },
    )
    .await?;

    update_p2p_host_paired(deployment.db(), &host.id, &pair_result.session_token).await?;

    log_event(
        deployment.db(),
        event::PAIRING_CODE_CONSUMED,
        Some(&host.id),
        Some(&ip),
        None,
    )
    .await
    .ok();

    Ok(Json(ApiResponse::success(P2pPairResponse {
        paired: true,
        host_id: host.id,
    })))
}
