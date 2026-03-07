use anyhow::Context as _;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use base64::{
    Engine as _,
    engine::general_purpose::{STANDARD as BASE64_STANDARD, URL_SAFE_NO_PAD},
};
use chrono::Utc;
use ed25519_dalek::SigningKey;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use spake2::{Ed25519Group, Identity, Password, Spake2, SysRng, UnwrapErr};
use trusted_key_auth::{
    key_confirmation::{build_client_proof, verify_server_proof},
    spake2::normalize_enrollment_code,
    trusted_keys::parse_public_key_base64,
};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use super::types::{
    FinishSpake2EnrollmentRequest, FinishSpake2EnrollmentResponse, StartSpake2EnrollmentRequest,
    StartSpake2EnrollmentResponse,
};
use crate::{DeploymentImpl, relay::client::RelayApiClient};

const SPAKE2_CLIENT_ID: &[u8] = b"vibe-kanban-browser";
const SPAKE2_SERVER_ID: &[u8] = b"vibe-kanban-server";

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/relay-auth/client/pair", post(pair_relay_host))
        .route("/relay-auth/client/hosts", get(list_relay_paired_hosts))
        .route(
            "/relay-auth/client/hosts/{host_id}",
            delete(remove_relay_paired_host),
        )
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PairRelayHostRequest {
    pub host_id: Uuid,
    pub host_name: String,
    pub enrollment_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PairRelayHostResponse {
    pub paired: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RelayPairedHost {
    pub host_id: Uuid,
    pub host_name: Option<String>,
    pub paired_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListRelayPairedHostsResponse {
    pub hosts: Vec<RelayPairedHost>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RemoveRelayPairedHostResponse {
    pub removed: bool,
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

    match deployment
        .upsert_relay_host_credentials(
            req.host_id,
            paired_credentials.signing_session_id,
            paired_credentials.private_key_jwk,
            Some(req.host_name.clone()),
            Some(Utc::now().to_rfc3339()),
        )
        .await
    {
        Ok(()) => (
            StatusCode::OK,
            Json(ApiResponse::<PairRelayHostResponse>::success(
                PairRelayHostResponse { paired: true },
            )),
        )
            .into_response(),
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

#[derive(Debug, Clone)]
struct PairedCredentials {
    signing_session_id: String,
    private_key_jwk: serde_json::Value,
}

async fn pair_relay_host_credentials(
    deployment: &DeploymentImpl,
    req: &PairRelayHostRequest,
) -> anyhow::Result<PairedCredentials> {
    let remote_client = deployment.remote_client()?;
    let relay_client = RelayApiClient::new(
        remote_client
            .access_token()
            .await
            .context("Failed to get access token for relay auth code")?,
    );
    let relay_browser_session = relay_client.create_session(req.host_id).await?;

    let normalized_code = normalize_enrollment_code(&req.enrollment_code)
        .map_err(|error| anyhow::anyhow!(error.to_string()))?;

    let password = Password::new(normalized_code.as_bytes());
    let id_a = Identity::new(SPAKE2_CLIENT_ID);
    let id_b = Identity::new(SPAKE2_SERVER_ID);
    let (client_state, client_message) =
        Spake2::<Ed25519Group>::start_a_with_rng(&password, &id_a, &id_b, UnwrapErr(SysRng));

    let start_response: StartSpake2EnrollmentResponse = relay_client
        .post_session_api(
            &relay_browser_session,
            "/api/relay-auth/server/spake2/start",
            &StartSpake2EnrollmentRequest {
                enrollment_code: normalized_code,
                client_message_b64: BASE64_STANDARD.encode(client_message),
            },
        )
        .await?;

    let server_message = BASE64_STANDARD
        .decode(&start_response.server_message_b64)
        .context("Invalid server_message_b64 in relay PAKE response")?;
    let shared_key = client_state
        .finish(&server_message)
        .map_err(|_| anyhow::anyhow!("Failed to complete relay PAKE handshake"))?;

    let mut csprng = OsRng;
    let signing_key = SigningKey::generate(&mut csprng);
    let browser_public_key = signing_key.verifying_key();
    let browser_public_key_b64 = BASE64_STANDARD.encode(browser_public_key.as_bytes());
    let client_proof_b64 = build_client_proof(
        &shared_key,
        &start_response.enrollment_id,
        browser_public_key.as_bytes(),
    )
    .map_err(|_| anyhow::anyhow!("Failed to build relay PAKE client proof"))?;

    let os = os_info::get();
    let finish_response: FinishSpake2EnrollmentResponse = relay_client
        .post_session_api(
            &relay_browser_session,
            "/api/relay-auth/server/spake2/finish",
            &FinishSpake2EnrollmentRequest {
                enrollment_id: start_response.enrollment_id,
                client_id: Uuid::new_v4(),
                client_name: format!("Vibe Kanban Relay Pairing ({})", req.host_name),
                client_browser: "local-backend".to_string(),
                client_os: format!("{} {}", os.os_type(), os.version()),
                client_device: "desktop".to_string(),
                public_key_b64: browser_public_key_b64,
                client_proof_b64,
            },
        )
        .await?;

    let server_public_key = parse_public_key_base64(&finish_response.server_public_key_b64)
        .map_err(|_| anyhow::anyhow!("Invalid server_public_key_b64 in relay PAKE response"))?;

    verify_server_proof(
        &shared_key,
        &start_response.enrollment_id,
        browser_public_key.as_bytes(),
        server_public_key.as_bytes(),
        &finish_response.server_proof_b64,
    )
    .map_err(|_| anyhow::anyhow!("Relay server proof verification failed"))?;

    Ok(PairedCredentials {
        signing_session_id: finish_response.signing_session_id.to_string(),
        private_key_jwk: signing_key_to_jwk(&signing_key),
    })
}

fn signing_key_to_jwk(signing_key: &SigningKey) -> serde_json::Value {
    let public_key = signing_key.verifying_key();
    serde_json::json!({
        "kty": "OKP",
        "crv": "Ed25519",
        "x": URL_SAFE_NO_PAD.encode(public_key.as_bytes()),
        "d": URL_SAFE_NO_PAD.encode(signing_key.to_bytes()),
        "key_ops": ["sign"],
        "ext": true
    })
}
