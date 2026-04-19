use std::sync::Arc;

use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    http::HeaderMap,
    routing::{get, post, put},
};
use db::{
    p2p_audit_log::{event, log_event},
    p2p_hosts::{self, CreateP2pHostParams, get_p2p_host, update_p2p_host_ssh_config},
};
use deployment::Deployment;
use rand::Rng;
use serde::{Deserialize, Serialize};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError, p2p::PairingStore};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAIRING_CHARSET: &[u8] = b"23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
fn rate_limit_config() -> (i64, i64) {
    let max_attempts = std::env::var("P2P_RATE_LIMIT_MAX_ATTEMPTS")
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(5);
    let window_minutes = std::env::var("P2P_RATE_LIMIT_WINDOW_MINUTES")
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(15);
    (max_attempts, window_minutes)
}

fn generate_pairing_code() -> String {
    let mut rng = rand::thread_rng();
    (0..8)
        .map(|_| PAIRING_CHARSET[rng.gen_range(0..PAIRING_CHARSET.len())] as char)
        .collect()
}

fn generate_session_token() -> String {
    uuid::Uuid::new_v4().to_string().replace('-', "")
}

fn extract_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .or_else(|| headers.get("x-real-ip"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or(s).trim().to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string())
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router(pairing_store: Arc<PairingStore>) -> Router<DeploymentImpl> {
    Router::new()
        .route("/p2p/hosts", get(list_hosts))
        .route("/p2p/hosts/{id}", get(get_host).delete(remove_host))
        .route("/p2p/hosts/{id}/revoke", post(revoke_host))
        .route("/p2p/hosts/{id}/ssh-config", put(update_ssh_config))
        .route("/p2p/hosts/{id}/rotate-token", post(rotate_token))
        .route("/p2p/enrollment-code", post(create_enrollment_code))
        .route("/p2p/pair", post(pair_host))
        .route("/p2p/ssh-pair", post(ssh_pair))
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

#[derive(Debug, Deserialize)]
struct SshPairRequest {
    name: String,
    /// Hostname or IP of the remote machine.
    address: String,
    ssh_port: u16,
    ssh_user: String,
    ssh_key_path: String,
    /// Relay port on the remote machine (defaults to 8081).
    relay_port: Option<u16>,
}

#[derive(Debug, Serialize)]
struct SshPairResponse {
    host_id: String,
    session_token: String,
    host_key_fingerprint: String,
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
    if deleted {
        log_event(deployment.db(), event::HOST_REVOKED, Some(&id), None, None)
            .await
            .ok();
    }
    Ok(Json(ApiResponse::success(deleted)))
}

async fn create_enrollment_code(
    headers: HeaderMap,
    State(deployment): State<DeploymentImpl>,
    Extension(pairing_store): Extension<Arc<PairingStore>>,
) -> Result<Json<ApiResponse<EnrollmentCodeResponse>>, ApiError> {
    let ip = extract_ip(&headers);
    let code = generate_pairing_code();
    pairing_store.set_pending_code(code.clone(), 5);
    log_event(
        deployment.db(),
        event::PAIRING_CODE_REQUESTED,
        None,
        Some(&ip),
        None,
    )
    .await
    .ok();
    Ok(Json(ApiResponse::success(EnrollmentCodeResponse { code })))
}

async fn pair_host(
    State(deployment): State<DeploymentImpl>,
    Extension(pairing_store): Extension<Arc<PairingStore>>,
    Json(req): Json<PairRequest>,
) -> Result<Json<ApiResponse<PairResponse>>, ApiError> {
    let ip = &req.caller_address;

    // Rate-limit: at most N attempts per IP in the last W minutes (env-configurable).
    let (max_attempts, window_minutes) = rate_limit_config();
    let attempts =
        p2p_hosts::count_recent_pairing_attempts(deployment.db(), ip, window_minutes).await?;
    if attempts >= max_attempts {
        log_event(
            deployment.db(),
            event::PAIRING_FAILED,
            None,
            Some(ip),
            Some("rate limit exceeded"),
        )
        .await
        .ok();
        return Err(ApiError::TooManyRequests(
            "Too many pairing attempts. Please wait before trying again.".to_string(),
        ));
    }

    // Validate and consume the single-use pairing code.
    if !pairing_store.consume_code(&req.code) {
        p2p_hosts::record_pairing_attempt(deployment.db(), ip, false).await?;
        log_event(
            deployment.db(),
            event::PAIRING_FAILED,
            None,
            Some(ip),
            Some("invalid code"),
        )
        .await
        .ok();
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
    p2p_hosts::record_pairing_attempt(deployment.db(), ip, true).await?;

    log_event(
        deployment.db(),
        event::PAIRING_CODE_CONSUMED,
        Some(&host.id),
        Some(ip),
        None,
    )
    .await
    .ok();

    Ok(Json(ApiResponse::success(PairResponse { session_token })))
}

/// SSH-key–based pairing flow.
///
/// The caller supplies SSH credentials (host, port, user, key path).  We open a
/// test SSH tunnel to verify the credentials and capture the server's host key
/// fingerprint via TOFU.  The fingerprint is stored so that subsequent
/// reconnections can verify the key has not changed.
///
/// No pairing code is required — possession of the SSH private key proves
/// identity.
async fn ssh_pair(
    headers: HeaderMap,
    State(deployment): State<DeploymentImpl>,
    Json(req): Json<SshPairRequest>,
) -> Result<Json<ApiResponse<SshPairResponse>>, ApiError> {
    use db::p2p_hosts::{
        update_known_host_key, update_p2p_host_paired, update_p2p_host_ssh_config,
    };
    use ssh_tunnel::{SshConfig, SshTunnel};

    let ip = extract_ip(&headers);
    let relay_port = req.relay_port.unwrap_or(8081) as i64;
    let db = deployment.db();

    // Rate-limit: at most N SSH pairing attempts per IP in the last W minutes (env-configurable).
    let (max_attempts, window_minutes) = rate_limit_config();
    let attempts = p2p_hosts::count_recent_pairing_attempts(db, &ip, window_minutes).await?;
    if attempts >= max_attempts {
        log_event(
            db,
            event::SSH_PAIR_FAILED,
            None,
            Some(&ip),
            Some("rate limit exceeded"),
        )
        .await
        .ok();
        return Err(ApiError::TooManyRequests(
            "Too many SSH pairing attempts. Please wait before trying again.".to_string(),
        ));
    }

    // Open a temporary SSH tunnel to verify credentials and capture the host key.
    // The tunnel is dropped immediately after — we only need it for the handshake.
    let tunnel = match SshTunnel::start(SshConfig {
        ssh_host: req.address.clone(),
        ssh_port: req.ssh_port,
        ssh_user: req.ssh_user.clone(),
        key_path: req.ssh_key_path.clone(),
        remote_host: "127.0.0.1".to_string(),
        remote_port: relay_port as u16,
        expected_fingerprint: None, // TOFU on first pairing
    })
    .await
    {
        Ok(t) => t,
        Err(e) => {
            p2p_hosts::record_pairing_attempt(db, &ip, false).await?;
            log_event(
                db,
                event::SSH_PAIR_FAILED,
                None,
                Some(&ip),
                Some(&format!("SSH connection failed: {e}")),
            )
            .await
            .ok();
            return Err(ApiError::BadRequest(format!("SSH connection failed: {e}")));
        }
    };

    let fingerprint = tunnel.captured_fingerprint.clone().unwrap_or_default();
    drop(tunnel);

    // Persist the new host entry.
    let host = p2p_hosts::create_p2p_host(
        db,
        db::p2p_hosts::CreateP2pHostParams {
            name: req.name.clone(),
            address: req.address.clone(),
            relay_port,
            machine_id: format!("ssh-{}", req.address),
        },
    )
    .await?;

    // Record SSH connection details.
    update_p2p_host_ssh_config(
        db,
        &host.id,
        Some(&req.ssh_user),
        req.ssh_port as i64,
        Some(&req.ssh_key_path),
        "ssh",
    )
    .await?;

    // Store the captured host key fingerprint for subsequent TOFU verification.
    update_known_host_key(db, &host.id, &fingerprint).await?;

    // Mark the host as paired with a fresh session token.
    let session_token = generate_session_token();
    update_p2p_host_paired(db, &host.id, &session_token).await?;

    // Record successful SSH pairing attempt and emit audit event.
    p2p_hosts::record_pairing_attempt(db, &ip, true).await?;
    log_event(db, event::SSH_PAIR_SUCCESS, Some(&host.id), Some(&ip), None)
        .await
        .ok();

    Ok(Json(ApiResponse::success(SshPairResponse {
        host_id: host.id,
        session_token,
        host_key_fingerprint: fingerprint,
    })))
}

// ---------------------------------------------------------------------------
// Request types (continued)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct UpdateSshConfigRequest {
    pub ssh_user: Option<String>,
    pub ssh_port: Option<u16>,
    pub ssh_key_path: Option<String>,
    /// Accepted values: "direct" | "ssh" | "auto"
    pub connection_mode: Option<String>,
}

// ---------------------------------------------------------------------------
// New handlers
// ---------------------------------------------------------------------------

async fn get_host(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<db::p2p_hosts::P2pHost>>, ApiError> {
    match get_p2p_host(deployment.db(), &id).await? {
        Some(host) => Ok(Json(ApiResponse::success(host))),
        None => Err(ApiError::BadRequest(format!("Host not found: {id}"))),
    }
}

async fn update_ssh_config(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<String>,
    Json(req): Json<UpdateSshConfigRequest>,
) -> Result<Json<ApiResponse<db::p2p_hosts::P2pHost>>, ApiError> {
    let db = deployment.db();

    let host = get_p2p_host(db, &id)
        .await?
        .ok_or_else(|| ApiError::BadRequest(format!("Host not found: {id}")))?;

    let ssh_user = req.ssh_user.as_deref().or(host.ssh_user.as_deref());
    let ssh_port = req.ssh_port.map(|p| p as i64).unwrap_or(host.ssh_port);
    let ssh_key_path = req.ssh_key_path.as_deref().or(host.ssh_key_path.as_deref());
    let connection_mode = req
        .connection_mode
        .as_deref()
        .unwrap_or(&host.connection_mode);

    if !matches!(connection_mode, "direct" | "ssh" | "auto") {
        return Err(ApiError::BadRequest(
            "connection_mode must be 'direct', 'ssh', or 'auto'".to_string(),
        ));
    }

    update_p2p_host_ssh_config(db, &id, ssh_user, ssh_port, ssh_key_path, connection_mode).await?;

    let updated = get_p2p_host(db, &id)
        .await?
        .ok_or_else(|| ApiError::BadRequest(format!("Host not found after update: {id}")))?;

    Ok(Json(ApiResponse::success(updated)))
}

async fn rotate_token(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let db = deployment.db();

    let new_token = db::p2p_hosts::rotate_session_token(db, &id).await?;

    log_event(db, event::SESSION_ROTATED, Some(&id), None, None)
        .await
        .ok();

    Ok(Json(ApiResponse::success(
        serde_json::json!({ "session_token": new_token }),
    )))
}

async fn revoke_host(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let db = deployment.db();

    // Fetch host to confirm it exists and capture machine_id for the audit log.
    let host = p2p_hosts::get_p2p_host(db, &id)
        .await?
        .ok_or_else(|| ApiError::BadRequest(format!("Host not found: {id}")))?;

    // Wipe token + mark revoked in DB (soft revocation).
    // The relay registry runs on the remote machine and is not accessible from
    // the server crate, so we rely on token invalidation: the next reconnect
    // attempt by the remote machine will be rejected because the stored token
    // no longer matches.
    // TODO: force-disconnect relay session for machine_id={host.machine_id}
    //       once the relay registry becomes accessible from the server crate.
    p2p_hosts::revoke_p2p_host(db, &id).await?;

    log_event(
        db,
        event::HOST_REVOKED,
        Some(&id),
        None,
        Some(&format!("revoked; machine_id={}", host.machine_id)),
    )
    .await
    .ok();

    Ok(Json(ApiResponse::success(
        serde_json::json!({ "revoked": true, "host_id": id }),
    )))
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

    #[test]
    fn test_extract_ip_x_forwarded_for() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "203.0.113.5, 10.0.0.1".parse().unwrap());
        assert_eq!(extract_ip(&headers), "203.0.113.5");
    }

    #[test]
    fn test_extract_ip_x_real_ip() {
        let mut headers = HeaderMap::new();
        headers.insert("x-real-ip", "203.0.113.5".parse().unwrap());
        assert_eq!(extract_ip(&headers), "203.0.113.5");
    }

    #[test]
    fn test_extract_ip_fallback() {
        let headers = HeaderMap::new();
        assert_eq!(extract_ip(&headers), "127.0.0.1");
    }
}
