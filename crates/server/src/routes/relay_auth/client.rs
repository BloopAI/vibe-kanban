use anyhow::Context as _;
use api_types::RelaySessionAuthCodeResponse;
use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::post,
};
use base64::{
    Engine as _,
    engine::general_purpose::{STANDARD as BASE64_STANDARD, URL_SAFE_NO_PAD},
};
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

use crate::DeploymentImpl;

const SPAKE2_CLIENT_ID: &[u8] = b"vibe-kanban-browser";
const SPAKE2_SERVER_ID: &[u8] = b"vibe-kanban-server";

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/relay-auth/client/pair", post(pair_relay_host))
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PairRelayHostRequest {
    pub host_id: String,
    pub host_name: String,
    pub enrollment_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct PairRelayHostResponse {
    pub paired: bool,
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

#[derive(Debug, Clone)]
struct PairedCredentials {
    signing_session_id: String,
    private_key_jwk: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
struct StartSpake2EnrollmentRequest {
    enrollment_code: String,
    client_message_b64: String,
}

#[derive(Debug, Clone, Deserialize)]
struct StartSpake2EnrollmentResponse {
    enrollment_id: Uuid,
    server_message_b64: String,
}

#[derive(Debug, Clone, Serialize)]
struct FinishSpake2EnrollmentRequest {
    enrollment_id: Uuid,
    client_id: Uuid,
    client_name: String,
    client_browser: String,
    client_os: String,
    client_device: String,
    public_key_b64: String,
    client_proof_b64: String,
}

#[derive(Debug, Clone, Deserialize)]
struct FinishSpake2EnrollmentResponse {
    signing_session_id: Uuid,
    server_public_key_b64: String,
    server_proof_b64: String,
}

async fn pair_relay_host_credentials(
    deployment: &DeploymentImpl,
    req: &PairRelayHostRequest,
) -> anyhow::Result<PairedCredentials> {
    let remote_client = deployment.remote_client()?;
    let relay_client = RelayApiClient::new(
        relay_api_base().ok_or_else(|| {
            anyhow::anyhow!("VK_SHARED_RELAY_API_BASE is not configured on local backend")
        })?,
        remote_client
            .access_token()
            .await
            .context("Failed to get access token for relay auth code")?,
    );
    let relay_browser_session =
        establish_relay_browser_session(&remote_client, &relay_client, &req.host_id).await?;

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

#[derive(Debug, Clone, Deserialize)]
struct CreateRelaySessionResponse {
    session: RelaySessionSummary,
}

#[derive(Debug, Clone, Deserialize)]
struct RelaySessionSummary {
    id: Uuid,
}

#[derive(Debug, Clone)]
struct RelayBrowserSession {
    host_id: String,
    browser_session_id: Uuid,
}

async fn establish_relay_browser_session(
    remote_client: &services::services::remote_client::RemoteClient,
    relay_client: &RelayApiClient,
    host_id: &str,
) -> anyhow::Result<RelayBrowserSession> {
    let create_session_path = format!("/v1/hosts/{host_id}/sessions");
    let session_response: CreateRelaySessionResponse = remote_client
        .post_authed(&create_session_path, None::<&()>)
        .await
        .context("Failed to create relay session")?;
    let auth_code = relay_client
        .create_session_auth_code(session_response.session.id)
        .await?;

    Ok(RelayBrowserSession {
        host_id: host_id.to_string(),
        browser_session_id: auth_code.browser_session_id,
    })
}

fn relay_api_base() -> Option<String> {
    std::env::var("VK_SHARED_RELAY_API_BASE")
        .ok()
        .or_else(|| option_env!("VK_SHARED_RELAY_API_BASE").map(|s| s.to_string()))
        .map(|base| base.trim_end_matches('/').to_string())
}

#[derive(Debug, Clone)]
struct RelayApiClient {
    http: reqwest::Client,
    relay_api_base: String,
    access_token: String,
}

impl RelayApiClient {
    fn new(relay_api_base: String, access_token: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            relay_api_base,
            access_token,
        }
    }

    async fn create_session_auth_code(
        &self,
        session_id: Uuid,
    ) -> anyhow::Result<RelaySessionAuthCodeResponse> {
        let auth_code_url = format!(
            "{}/v1/relay/sessions/{session_id}/auth-code",
            self.relay_api_base
        );
        let response = self
            .http
            .post(auth_code_url)
            .header("X-Client-Version", env!("CARGO_PKG_VERSION"))
            .header("X-Client-Type", "local-backend")
            .bearer_auth(&self.access_token)
            .send()
            .await
            .context("Failed to create relay auth code")?;
        let status = response.status();

        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to create relay auth code (status {status}): {body}");
        }

        response
            .json::<RelaySessionAuthCodeResponse>()
            .await
            .context("Failed to decode relay auth code response")
    }

    async fn post_session_api<TPayload, TData>(
        &self,
        relay_browser_session: &RelayBrowserSession,
        path: &str,
        payload: &TPayload,
    ) -> anyhow::Result<TData>
    where
        TPayload: Serialize,
        TData: for<'de> Deserialize<'de>,
    {
        let url = format!(
            "{}/relay/h/{}/s/{}{}",
            self.relay_api_base,
            relay_browser_session.host_id,
            relay_browser_session.browser_session_id,
            path
        );
        let response = self
            .http
            .post(url)
            .json(payload)
            .send()
            .await
            .with_context(|| format!("Relay request failed for '{path}'"))?;
        let status = response.status();
        let response_json = response
            .json::<ApiResponse<TData>>()
            .await
            .with_context(|| format!("Failed to parse relay response for '{path}'"))?;

        if !status.is_success() {
            let message = response_json.message().unwrap_or("Relay request failed");
            anyhow::bail!("{message} (status {status})");
        }

        if !response_json.is_success() {
            let message = response_json.message().unwrap_or("Relay request failed");
            anyhow::bail!("{message}");
        }

        response_json
            .into_data()
            .ok_or_else(|| anyhow::anyhow!("Relay response was missing data"))
    }
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
