use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Context as _;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use http::{HeaderMap, HeaderName, Method};
use relay_control::signing::{
    self, NONCE_HEADER, REQUEST_SIGNATURE_HEADER, SIGNING_SESSION_HEADER, TIMESTAMP_HEADER,
};
use relay_types::{
    FinishSpake2EnrollmentRequest, FinishSpake2EnrollmentResponse, PairRelayHostRequest,
    RefreshRelaySigningSessionRequest, RefreshRelaySigningSessionResponse, RelayAuthState,
    RemoteSession, StartSpake2EnrollmentRequest, StartSpake2EnrollmentResponse,
};
use relay_ws_client::{RelayUpstreamSocket, RelayWsConnectError, connect_signed_relay_websocket};
use relay_ws_protocol::RELAY_HEADER;
use reqwest::Client;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use spake2::{Ed25519Group, Identity, Password, Spake2, SysRng, UnwrapErr};
use trusted_key_auth::{
    key_confirmation::{build_client_proof, verify_server_proof},
    refresh::build_refresh_message,
    spake2::normalize_enrollment_code,
    trusted_keys::parse_public_key_base64,
};
use uuid::Uuid;

const SPAKE2_CLIENT_ID: &[u8] = b"vibe-kanban-browser";
const SPAKE2_SERVER_ID: &[u8] = b"vibe-kanban-server";

#[derive(Debug, Clone)]
pub struct RelayApiClient {
    http: Client,
    base_url: String,
    access_token: String,
}

impl RelayApiClient {
    pub fn new(base_url: String, access_token: String) -> Self {
        Self {
            http: Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            access_token,
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    fn authenticated_post(&self, url: String) -> reqwest::RequestBuilder {
        self.http
            .post(url)
            .header("X-Client-Version", env!("CARGO_PKG_VERSION"))
            .header("X-Client-Type", "local-backend")
            .bearer_auth(&self.access_token)
    }

    pub async fn create_session(&self, host_id: Uuid) -> anyhow::Result<RemoteSession> {
        let url = format!("{}/v1/relay/create/{host_id}", self.base_url);
        let response = self
            .authenticated_post(url)
            .send()
            .await
            .context("Failed to create relay session")?;
        let status = response.status();

        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to create relay session (status {status}): {body}");
        }

        let res = response
            .json::<CreateRelaySessionResponse>()
            .await
            .context("Failed to decode relay session response")?;

        Ok(RemoteSession {
            host_id,
            id: res.session_id,
        })
    }

    pub async fn post_session_api<TPayload, TData>(
        &self,
        remote_session: &RemoteSession,
        path: &str,
        payload: &TPayload,
    ) -> anyhow::Result<TData>
    where
        TPayload: Serialize,
        TData: DeserializeOwned,
    {
        let url = format!(
            "{}{path}",
            relay_session_url(&self.base_url, remote_session.host_id, remote_session.id)
        );
        let response = self
            .authenticated_post(url)
            .json(payload)
            .send()
            .await
            .with_context(|| format!("Relay request failed for '{path}'"))?;
        let status = response.status();
        let response_json = response
            .json::<RelayApiResponse<TData>>()
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

    pub async fn refresh_signing_session(
        &self,
        remote_session: &RemoteSession,
        signing_key: &SigningKey,
        client_id: Uuid,
    ) -> anyhow::Result<RefreshRelaySigningSessionResponse> {
        let timestamp = unix_timestamp_now()?;
        let nonce = Uuid::new_v4().simple().to_string();
        let refresh_message = build_refresh_message(timestamp, &nonce, client_id);
        let signature_b64 =
            BASE64_STANDARD.encode(signing_key.sign(refresh_message.as_bytes()).to_bytes());

        let payload = RefreshRelaySigningSessionRequest {
            client_id,
            timestamp,
            nonce,
            signature_b64,
        };

        self.post_session_api(
            remote_session,
            "/api/relay-auth/server/signing-session/refresh",
            &payload,
        )
        .await
    }

    pub async fn pair_host(
        &self,
        request: &PairRelayHostRequest,
        signing_key: &SigningKey,
    ) -> anyhow::Result<PairRelayHostResult> {
        let remote_session = self.create_session(request.host_id).await?;

        let normalized_code = normalize_enrollment_code(&request.enrollment_code)
            .map_err(|error| anyhow::anyhow!(error.to_string()))?;

        let password = Password::new(normalized_code.as_bytes());
        let id_a = Identity::new(SPAKE2_CLIENT_ID);
        let id_b = Identity::new(SPAKE2_SERVER_ID);
        let (client_state, client_message) =
            Spake2::<Ed25519Group>::start_a_with_rng(&password, &id_a, &id_b, UnwrapErr(SysRng));

        let start_response: StartSpake2EnrollmentResponse = self
            .post_session_api(
                &remote_session,
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

        let client_public_key = signing_key.verifying_key();
        let client_public_key_b64 = BASE64_STANDARD.encode(client_public_key.as_bytes());
        let client_proof_b64 = build_client_proof(
            &shared_key,
            &start_response.enrollment_id,
            client_public_key.as_bytes(),
        )
        .map_err(|_| anyhow::anyhow!("Failed to build relay PAKE client proof"))?;

        let os = os_info::get();
        let client_id = Uuid::new_v4();
        let finish_response: FinishSpake2EnrollmentResponse = self
            .post_session_api(
                &remote_session,
                "/api/relay-auth/server/spake2/finish",
                &FinishSpake2EnrollmentRequest {
                    enrollment_id: start_response.enrollment_id,
                    client_id,
                    client_name: format!("Vibe Kanban Relay Pairing ({})", request.host_name),
                    client_browser: "local-backend".to_string(),
                    client_os: format!("{} {}", os.os_type(), os.version()),
                    client_device: "desktop".to_string(),
                    public_key_b64: client_public_key_b64,
                    client_proof_b64,
                },
            )
            .await?;

        let server_public_key = parse_public_key_base64(&finish_response.server_public_key_b64)
            .map_err(|_| anyhow::anyhow!("Invalid server_public_key_b64 in relay PAKE response"))?;

        verify_server_proof(
            &shared_key,
            &start_response.enrollment_id,
            client_public_key.as_bytes(),
            server_public_key.as_bytes(),
            &finish_response.server_proof_b64,
        )
        .map_err(|_| anyhow::anyhow!("Relay server proof verification failed"))?;

        Ok(PairRelayHostResult {
            signing_session_id: finish_response.signing_session_id,
            client_id,
            server_public_key_b64: finish_response.server_public_key_b64,
        })
    }
}

#[derive(Debug, Clone)]
pub struct PairRelayHostResult {
    pub signing_session_id: Uuid,
    pub client_id: Uuid,
    pub server_public_key_b64: String,
}

#[derive(Debug, Clone)]
pub struct RelayHostIdentity {
    pub host_id: Uuid,
    pub client_id: Uuid,
    pub server_verify_key: VerifyingKey,
}

#[derive(Debug)]
pub enum RelayTransportBootstrapError {
    RemoteSession(anyhow::Error),
    SigningSession(anyhow::Error),
}

#[derive(Debug)]
pub enum RelayTransportError {
    Upstream(anyhow::Error),
    SigningSession(anyhow::Error),
    RemoteSession(anyhow::Error),
}

pub struct RelayHostTransport {
    api_client: RelayApiClient,
    identity: RelayHostIdentity,
    auth_state: RelayAuthState,
    signing_key: SigningKey,
}

impl RelayHostTransport {
    pub async fn bootstrap(
        api_client: RelayApiClient,
        identity: RelayHostIdentity,
        signing_key: SigningKey,
        cached_remote_session: Option<RemoteSession>,
        cached_signing_session_id: Option<String>,
    ) -> Result<Self, RelayTransportBootstrapError> {
        let remote_session = match cached_remote_session {
            Some(remote_session) => remote_session,
            None => api_client
                .create_session(identity.host_id)
                .await
                .map_err(RelayTransportBootstrapError::RemoteSession)?,
        };
        let signing_session_id = match cached_signing_session_id {
            Some(signing_session_id) => signing_session_id,
            None => api_client
                .refresh_signing_session(&remote_session, &signing_key, identity.client_id)
                .await
                .map(|response| response.signing_session_id.to_string())
                .map_err(RelayTransportBootstrapError::SigningSession)?,
        };

        Ok(Self {
            api_client,
            identity,
            auth_state: RelayAuthState {
                remote_session,
                signing_session_id,
            },
            signing_key,
        })
    }

    pub fn auth_state(&self) -> &RelayAuthState {
        &self.auth_state
    }

    pub fn relay_base_url(&self) -> &str {
        self.api_client.base_url()
    }

    pub fn relay_url(&self) -> String {
        relay_session_url(
            self.relay_base_url(),
            self.identity.host_id,
            self.auth_state.remote_session.id,
        )
    }

    pub fn signing_key(&self) -> &SigningKey {
        &self.signing_key
    }

    pub fn server_verify_key(&self) -> &VerifyingKey {
        &self.identity.server_verify_key
    }

    pub async fn send_http(
        &mut self,
        method: &Method,
        target_path: &str,
        headers: &HeaderMap,
        body: &[u8],
    ) -> Result<reqwest::Response, RelayTransportError> {
        let first = self
            .send_http_once(method, target_path, headers, body)
            .await
            .map_err(RelayTransportError::Upstream)?;
        if !is_auth_failure_status(first.status()) {
            return Ok(first);
        }

        if self.refresh_signing_session().await.is_err() {
            return Ok(first);
        }

        let second = self
            .send_http_once(method, target_path, headers, body)
            .await
            .map_err(RelayTransportError::Upstream)?;
        if !is_auth_failure_status(second.status()) {
            return Ok(second);
        }

        if self.rotate_remote_session().await.is_err() {
            return Ok(second);
        }

        self.send_http_once(method, target_path, headers, body)
            .await
            .map_err(RelayTransportError::Upstream)
    }

    pub async fn connect_ws(
        &mut self,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Result<(RelayUpstreamSocket, Option<String>), RelayTransportError> {
        match self.connect_ws_once(target_path, protocols).await {
            Ok(result) => return Ok(result),
            Err(RelayWsConnectError::AuthFailure) => {}
            Err(error) => {
                return Err(RelayTransportError::Upstream(relay_ws_error_to_anyhow(
                    error,
                    "Failed to connect relay host websocket",
                )));
            }
        }

        self.refresh_signing_session()
            .await
            .map_err(RelayTransportError::SigningSession)?;

        match self.connect_ws_once(target_path, protocols).await {
            Ok(result) => return Ok(result),
            Err(RelayWsConnectError::AuthFailure) => {}
            Err(error) => {
                return Err(RelayTransportError::Upstream(relay_ws_error_to_anyhow(
                    error,
                    "Failed to connect relay host websocket after signing refresh",
                )));
            }
        }

        self.rotate_remote_session()
            .await
            .map_err(RelayTransportError::RemoteSession)?;

        self.connect_ws_once(target_path, protocols)
            .await
            .map_err(|error| {
                RelayTransportError::Upstream(relay_ws_error_to_anyhow(
                    error,
                    "Failed to connect relay host websocket after session rotation",
                ))
            })
    }

    pub async fn get_signed_json<TData>(&mut self, path: &str) -> Result<TData, RelayTransportError>
    where
        TData: DeserializeOwned,
    {
        if let Ok(data) = self.get_signed_json_once(path).await {
            return Ok(data);
        }

        self.refresh_signing_session()
            .await
            .map_err(RelayTransportError::SigningSession)?;

        if let Ok(data) = self.get_signed_json_once(path).await {
            return Ok(data);
        }

        self.rotate_remote_session()
            .await
            .map_err(RelayTransportError::RemoteSession)?;

        self.get_signed_json_once(path)
            .await
            .map_err(RelayTransportError::Upstream)
    }

    async fn send_http_once(
        &self,
        method: &Method,
        target_path: &str,
        headers: &HeaderMap,
        body: &[u8],
    ) -> anyhow::Result<reqwest::Response> {
        send_signed_http(
            self.relay_base_url(),
            &self.auth_state.remote_session,
            &self.signing_key,
            &self.auth_state.signing_session_id,
            method,
            target_path,
            headers,
            body,
        )
        .await
    }

    async fn connect_ws_once(
        &self,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Result<(RelayUpstreamSocket, Option<String>), RelayWsConnectError> {
        connect_signed_relay_websocket(
            &relay_session_url(
                self.relay_base_url(),
                self.identity.host_id,
                self.auth_state.remote_session.id,
            ),
            target_path,
            protocols,
            &self.signing_key,
            &self.auth_state.signing_session_id,
            self.identity.server_verify_key,
        )
        .await
    }

    async fn get_signed_json_once<TData>(&self, path: &str) -> anyhow::Result<TData>
    where
        TData: DeserializeOwned,
    {
        get_signed_relay_api(
            self.relay_base_url(),
            self.identity.host_id,
            self.auth_state.remote_session.id,
            path,
            &self.signing_key,
            &self.auth_state.signing_session_id,
        )
        .await
    }

    async fn refresh_signing_session(&mut self) -> anyhow::Result<()> {
        let refreshed = self
            .api_client
            .refresh_signing_session(
                &self.auth_state.remote_session,
                &self.signing_key,
                self.identity.client_id,
            )
            .await?;
        self.auth_state.signing_session_id = refreshed.signing_session_id.to_string();
        Ok(())
    }

    async fn rotate_remote_session(&mut self) -> anyhow::Result<()> {
        self.auth_state.remote_session = self
            .api_client
            .create_session(self.identity.host_id)
            .await?;
        Ok(())
    }
}

pub fn relay_session_url(base_url: &str, host_id: Uuid, session_id: Uuid) -> String {
    format!(
        "{}/v1/relay/h/{host_id}/s/{session_id}",
        base_url.trim_end_matches('/')
    )
}

async fn get_signed_relay_api<TData>(
    base_url: &str,
    host_id: Uuid,
    session_id: Uuid,
    path: &str,
    signing_key: &SigningKey,
    signing_session_id: &str,
) -> anyhow::Result<TData>
where
    TData: DeserializeOwned,
{
    let url = format!("{}{path}", relay_session_url(base_url, host_id, session_id));
    let sig = signing::build_request_signature(signing_key, signing_session_id, "GET", path, &[]);

    let response = Client::new()
        .get(url)
        .header(signing::SIGNING_SESSION_HEADER, &sig.signing_session_id)
        .header(signing::TIMESTAMP_HEADER, sig.timestamp.to_string())
        .header(signing::NONCE_HEADER, &sig.nonce)
        .header(signing::REQUEST_SIGNATURE_HEADER, &sig.signature_b64)
        .send()
        .await
        .with_context(|| format!("Relay request failed for '{path}'"))?;

    let status = response.status();
    let payload = response
        .json::<RelayApiResponse<TData>>()
        .await
        .with_context(|| format!("Failed to decode relay response for '{path}'"))?;

    if !status.is_success() || !payload.is_success() {
        let message = payload
            .message()
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("Relay request failed for '{path}'"));
        anyhow::bail!("{message}");
    }

    payload
        .into_data()
        .ok_or_else(|| anyhow::anyhow!("Missing response data for relay path '{path}'"))
}

#[allow(clippy::too_many_arguments)]
async fn send_signed_http(
    base_url: &str,
    remote_session: &RemoteSession,
    signing_key: &SigningKey,
    signing_session_id: &str,
    method: &Method,
    target_path: &str,
    headers: &HeaderMap,
    body: &[u8],
) -> anyhow::Result<reqwest::Response> {
    let signature = signing::build_request_signature(
        signing_key,
        signing_session_id,
        method.as_str(),
        target_path,
        body,
    );
    let url = format!(
        "{}{target_path}",
        relay_session_url(base_url, remote_session.host_id, remote_session.id)
    );
    let reqwest_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
        .context("Unsupported HTTP method for relay request")?;
    let mut builder = Client::new().request(reqwest_method, url);

    for (name, value) in headers {
        if should_forward_request_header(name) {
            builder = builder.header(name, value);
        }
    }

    builder = builder
        .header(RELAY_HEADER, "1")
        .header(SIGNING_SESSION_HEADER, &signature.signing_session_id)
        .header(TIMESTAMP_HEADER, signature.timestamp.to_string())
        .header(NONCE_HEADER, &signature.nonce)
        .header(REQUEST_SIGNATURE_HEADER, &signature.signature_b64);

    if !body.is_empty() {
        builder = builder.body(body.to_vec());
    }

    builder.send().await.context("Relay request to host failed")
}

fn relay_ws_error_to_anyhow(error: RelayWsConnectError, context: &'static str) -> anyhow::Error {
    match error {
        RelayWsConnectError::AuthFailure => anyhow::anyhow!("{context}: authentication failed"),
        RelayWsConnectError::Other(error) => anyhow::anyhow!("{context}: {error}"),
    }
}

fn is_hop_by_hop_header(name: &str) -> bool {
    name.eq_ignore_ascii_case("connection")
        || name.eq_ignore_ascii_case("keep-alive")
        || name.eq_ignore_ascii_case("proxy-authenticate")
        || name.eq_ignore_ascii_case("proxy-authorization")
        || name.eq_ignore_ascii_case("te")
        || name.eq_ignore_ascii_case("trailer")
        || name.eq_ignore_ascii_case("transfer-encoding")
        || name.eq_ignore_ascii_case("upgrade")
}

fn should_forward_request_header(name: &HeaderName) -> bool {
    let name = name.as_str();
    !name.eq_ignore_ascii_case("host")
        && !name.eq_ignore_ascii_case(RELAY_HEADER)
        && !name.eq_ignore_ascii_case(SIGNING_SESSION_HEADER)
        && !name.eq_ignore_ascii_case(TIMESTAMP_HEADER)
        && !name.eq_ignore_ascii_case(NONCE_HEADER)
        && !name.eq_ignore_ascii_case(REQUEST_SIGNATURE_HEADER)
        && !is_hop_by_hop_header(name)
}

fn is_auth_failure_status(status: reqwest::StatusCode) -> bool {
    status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN
}

fn unix_timestamp_now() -> anyhow::Result<i64> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| anyhow::anyhow!("system time before unix epoch"))?;
    i64::try_from(duration.as_secs()).map_err(anyhow::Error::from)
}

#[derive(Debug, Clone, Deserialize)]
struct CreateRelaySessionResponse {
    session_id: Uuid,
}

#[derive(Debug, Deserialize)]
struct RelayApiResponse<T> {
    success: bool,
    data: Option<T>,
    message: Option<String>,
}

impl<T> RelayApiResponse<T> {
    fn is_success(&self) -> bool {
        self.success
    }

    fn into_data(self) -> Option<T> {
        self.data
    }

    fn message(&self) -> Option<&str> {
        self.message.as_deref()
    }
}
