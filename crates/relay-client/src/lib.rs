use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use ed25519_dalek::VerifyingKey;
use http::{HeaderMap, HeaderName, Method};
use relay_control::signing::{
    NONCE_HEADER, REQUEST_SIGNATURE_HEADER, RelaySigningService, RequestSignature,
    SIGNING_SESSION_HEADER, TIMESTAMP_HEADER,
};
use relay_types::{
    FinishSpake2EnrollmentRequest, FinishSpake2EnrollmentResponse, PairRelayHostRequest,
    RefreshRelaySigningSessionRequest, RefreshRelaySigningSessionResponse, RelayAuthState,
    RemoteSession, StartSpake2EnrollmentRequest, StartSpake2EnrollmentResponse,
};
use relay_ws::{SignedTungsteniteSocket, signed_tungstenite_websocket};
use reqwest::Client;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use spake2::{Ed25519Group, Identity, Password, Spake2, SysRng, UnwrapErr};
use tokio_tungstenite::tungstenite::{self, client::IntoClientRequest};
use trusted_key_auth::{
    key_confirmation::{build_client_proof, verify_server_proof},
    refresh::build_refresh_message,
    spake2::normalize_enrollment_code,
    trusted_keys::parse_public_key_base64,
};
use utils::http_headers::is_hop_by_hop_header;
use uuid::Uuid;

pub const RELAY_HEADER: &str = "x-vk-relayed";

#[derive(Debug, thiserror::Error)]
pub enum RelayApiError {
    #[error("{0}")]
    Request(#[from] reqwest::Error),
    #[error("{0}")]
    WebSocket(#[from] tungstenite::Error),
    #[error("{0}")]
    Other(String),
}

const SPAKE2_CLIENT_ID: &[u8] = b"vibe-kanban-browser";
const SPAKE2_SERVER_ID: &[u8] = b"vibe-kanban-server";

#[derive(Clone)]
pub struct RelayApiClient {
    http: Client,
    base_url: String,
    access_token: String,
    signing: RelaySigningService,
}

impl std::fmt::Debug for RelayApiClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RelayApiClient")
            .field("base_url", &self.base_url)
            .finish_non_exhaustive()
    }
}

impl RelayApiClient {
    #[allow(clippy::result_large_err)]
    pub fn new(
        base_url: String,
        access_token: String,
        signing: RelaySigningService,
    ) -> Result<Self, RelayApiError> {
        let http = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .build()?;
        Ok(Self {
            http,
            base_url: base_url.trim_end_matches('/').to_string(),
            access_token,
            signing,
        })
    }

    fn base_url(&self) -> &str {
        &self.base_url
    }

    fn signing(&self) -> &RelaySigningService {
        &self.signing
    }

    fn authenticated_post(&self, url: String) -> reqwest::RequestBuilder {
        self.http
            .post(url)
            .header("X-Client-Version", env!("CARGO_PKG_VERSION"))
            .header("X-Client-Type", "local-backend")
            .bearer_auth(&self.access_token)
    }

    async fn create_session(&self, host_id: Uuid) -> Result<RemoteSession, RelayApiError> {
        let url = format!("{}/v1/relay/create/{host_id}", self.base_url);
        let response = self
            .authenticated_post(url)
            .send()
            .await?
            .error_for_status()?;
        let res = response.json::<CreateRelaySessionResponse>().await?;

        Ok(RemoteSession {
            host_id,
            id: res.session_id,
        })
    }

    async fn post_session_api<TPayload, TData>(
        &self,
        remote_session: &RemoteSession,
        path: &str,
        payload: &TPayload,
    ) -> Result<TData, RelayApiError>
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
            .await?
            .error_for_status()?;
        let response_json = response.json::<RelayApiResponse<TData>>().await?;
        Ok(response_json.data)
    }

    async fn refresh_signing_session(
        &self,
        remote_session: &RemoteSession,
        client_id: Uuid,
    ) -> Result<RefreshRelaySigningSessionResponse, RelayApiError> {
        let timestamp = unix_timestamp_now()?;
        let nonce = Uuid::new_v4().to_string();
        let refresh_message = build_refresh_message(timestamp, &nonce, client_id);
        let signature_b64 = BASE64_STANDARD.encode(
            self.signing
                .sign_bytes(refresh_message.as_bytes())
                .to_bytes(),
        );

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
    ) -> Result<PairRelayHostResult, RelayApiError> {
        let remote_session = self.create_session(request.host_id).await?;

        let normalized_code = normalize_enrollment_code(&request.enrollment_code)
            .map_err(|e| RelayApiError::Other(e.to_string()))?;

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
            .map_err(|e| RelayApiError::Other(format!("invalid server_message_b64: {e}")))?;
        let shared_key = client_state.finish(&server_message).map_err(|_| {
            RelayApiError::Other("failed to complete relay PAKE handshake".to_string())
        })?;

        let client_public_key = self.signing.server_public_key();
        let client_public_key_b64 = BASE64_STANDARD.encode(client_public_key.as_bytes());
        let client_proof_b64 = build_client_proof(
            &shared_key,
            &start_response.enrollment_id,
            client_public_key.as_bytes(),
        )
        .map_err(|_| RelayApiError::Other("failed to build relay PAKE client proof".to_string()))?;

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
            .map_err(|_| {
                RelayApiError::Other("invalid server_public_key_b64 in PAKE response".to_string())
            })?;

        verify_server_proof(
            &shared_key,
            &start_response.enrollment_id,
            client_public_key.as_bytes(),
            server_public_key.as_bytes(),
            &finish_response.server_proof_b64,
        )
        .map_err(|_| RelayApiError::Other("relay server proof verification failed".to_string()))?;

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

pub struct RelayHostTransport {
    api_client: RelayApiClient,
    identity: RelayHostIdentity,
    auth_state: RelayAuthState,
}

impl RelayHostTransport {
    pub async fn bootstrap(
        api_client: RelayApiClient,
        identity: RelayHostIdentity,
        cached_remote_session: Option<RemoteSession>,
        cached_signing_session_id: Option<Uuid>,
    ) -> Result<Self, RelayApiError> {
        let remote_session = match cached_remote_session {
            Some(remote_session) => remote_session,
            None => api_client.create_session(identity.host_id).await?,
        };
        let signing_session_id = match cached_signing_session_id {
            Some(signing_session_id) => signing_session_id,
            None => api_client
                .refresh_signing_session(&remote_session, identity.client_id)
                .await
                .map(|response| response.signing_session_id)?,
        };

        api_client
            .signing()
            .register_session(signing_session_id, identity.server_verify_key)
            .await;

        Ok(Self {
            api_client,
            identity,
            auth_state: RelayAuthState {
                remote_session,
                signing_session_id,
            },
        })
    }

    pub fn auth_state(&self) -> &RelayAuthState {
        &self.auth_state
    }

    fn relay_base_url(&self) -> &str {
        self.api_client.base_url()
    }

    pub fn relay_url(&self) -> String {
        relay_session_url(
            self.relay_base_url(),
            self.identity.host_id,
            self.auth_state.remote_session.id,
        )
    }

    pub async fn send_http(
        &mut self,
        method: &Method,
        target_path: &str,
        headers: &HeaderMap,
        body: &[u8],
    ) -> Result<reqwest::Response, RelayApiError> {
        let first = self
            .send_http_once(method, target_path, headers, body)
            .await?;
        if !is_auth_failure_status(first.status().as_u16()) {
            return Ok(first);
        }

        let mut last_auth_response = first;

        if self.refresh_signing_session().await.is_ok() {
            let second = self
                .send_http_once(method, target_path, headers, body)
                .await?;
            if !is_auth_failure_status(second.status().as_u16()) {
                return Ok(second);
            }
            last_auth_response = second;
        }

        if self.rotate_remote_session().await.is_err() {
            return Ok(last_auth_response);
        }
        if self.refresh_signing_session().await.is_err() {
            return Ok(last_auth_response);
        }

        self.send_http_once(method, target_path, headers, body)
            .await
    }

    pub async fn connect_ws(
        &mut self,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Result<(SignedTungsteniteSocket, Option<String>), RelayApiError> {
        let mut last_auth_error = match self.connect_ws_once(target_path, protocols).await {
            Ok(result) => return Ok(result),
            Err(e) if is_ws_auth_failure(&e) => e,
            Err(e) => return Err(e),
        };

        if self.refresh_signing_session().await.is_ok() {
            match self.connect_ws_once(target_path, protocols).await {
                Ok(result) => return Ok(result),
                Err(e) if is_ws_auth_failure(&e) => {
                    last_auth_error = e;
                }
                Err(e) => return Err(e),
            }
        }

        if self.rotate_remote_session().await.is_err() {
            return Err(last_auth_error);
        }
        if self.refresh_signing_session().await.is_err() {
            return Err(last_auth_error);
        }

        self.connect_ws_once(target_path, protocols).await
    }

    async fn send_http_once(
        &self,
        method: &Method,
        target_path: &str,
        headers: &HeaderMap,
        body: &[u8],
    ) -> Result<reqwest::Response, RelayApiError> {
        let signature = self.api_client.signing().sign_request(
            self.auth_state.signing_session_id,
            method.as_str(),
            target_path,
            body,
        );
        let url = format!(
            "{}{target_path}",
            relay_session_url(
                self.relay_base_url(),
                self.auth_state.remote_session.host_id,
                self.auth_state.remote_session.id
            )
        );
        let reqwest_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
            .map_err(|e| RelayApiError::Other(format!("Unsupported HTTP method: {e}")))?;
        let mut builder = self.api_client.http.request(reqwest_method, url);

        for (name, value) in headers {
            if should_forward_request_header(name) {
                builder = builder.header(name, value);
            }
        }

        builder = builder
            .header(RELAY_HEADER, "1")
            .header(
                SIGNING_SESSION_HEADER,
                signature.signing_session_id.to_string(),
            )
            .header(TIMESTAMP_HEADER, signature.timestamp.to_string())
            .header(NONCE_HEADER, signature.nonce.to_string())
            .header(REQUEST_SIGNATURE_HEADER, &signature.signature_b64);

        if !body.is_empty() {
            builder = builder.body(body.to_vec());
        }

        Ok(builder.send().await?)
    }

    async fn connect_ws_once(
        &self,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Result<(SignedTungsteniteSocket, Option<String>), RelayApiError> {
        let request_signature = self.api_client.signing().sign_request(
            self.auth_state.signing_session_id,
            "GET",
            target_path,
            &[],
        );

        let ws_url = relay_http_to_ws_url(&format!(
            "{}{target_path}",
            relay_session_url(
                self.relay_base_url(),
                self.auth_state.remote_session.host_id,
                self.auth_state.remote_session.id
            )
        ))?;
        let mut ws_request = ws_url.into_client_request()?;

        if let Some(value) = protocols
            && let Ok(header_value) = value.parse()
        {
            ws_request
                .headers_mut()
                .insert("sec-websocket-protocol", header_value);
        }

        set_ws_signing_headers(ws_request.headers_mut(), &request_signature);

        let (stream, response) = tokio_tungstenite::connect_async(ws_request).await?;

        let selected_protocol = response
            .headers()
            .get("sec-websocket-protocol")
            .and_then(|value| value.to_str().ok())
            .map(ToOwned::to_owned);

        let upstream_socket =
            signed_tungstenite_websocket(self.api_client.signing(), &request_signature, stream)
                .await
                .map_err(|e| RelayApiError::Other(e.to_string()))?;

        Ok((upstream_socket, selected_protocol))
    }

    async fn refresh_signing_session(&mut self) -> Result<(), RelayApiError> {
        let refreshed = self
            .api_client
            .refresh_signing_session(&self.auth_state.remote_session, self.identity.client_id)
            .await?;
        self.auth_state.signing_session_id = refreshed.signing_session_id;
        self.api_client
            .signing()
            .register_session(
                refreshed.signing_session_id,
                self.identity.server_verify_key,
            )
            .await;
        Ok(())
    }

    async fn rotate_remote_session(&mut self) -> Result<(), RelayApiError> {
        self.auth_state.remote_session = self
            .api_client
            .create_session(self.identity.host_id)
            .await?;
        Ok(())
    }
}

fn relay_session_url(base_url: &str, host_id: Uuid, session_id: Uuid) -> String {
    format!(
        "{}/v1/relay/h/{host_id}/s/{session_id}",
        base_url.trim_end_matches('/')
    )
}

#[allow(clippy::result_large_err)]
fn relay_http_to_ws_url(http_url: &str) -> Result<String, RelayApiError> {
    if let Some(rest) = http_url.strip_prefix("https://") {
        Ok(format!("wss://{rest}"))
    } else if let Some(rest) = http_url.strip_prefix("http://") {
        Ok(format!("ws://{rest}"))
    } else {
        Err(RelayApiError::Other(format!(
            "unsupported URL scheme: {http_url}"
        )))
    }
}

fn set_ws_signing_headers(
    headers: &mut tungstenite::http::HeaderMap,
    signature: &RequestSignature,
) {
    headers.insert(RELAY_HEADER, "1".parse().expect("static header value"));
    headers.insert(
        SIGNING_SESSION_HEADER,
        signature
            .signing_session_id
            .to_string()
            .parse()
            .expect("valid header value"),
    );
    headers.insert(
        TIMESTAMP_HEADER,
        signature
            .timestamp
            .to_string()
            .parse()
            .expect("valid header value"),
    );
    headers.insert(
        NONCE_HEADER,
        signature
            .nonce
            .to_string()
            .parse()
            .expect("valid header value"),
    );
    headers.insert(
        REQUEST_SIGNATURE_HEADER,
        signature.signature_b64.parse().expect("valid header value"),
    );
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

fn is_auth_failure_status(status_code: u16) -> bool {
    status_code == 401 || status_code == 403
}

fn is_ws_auth_failure(error: &RelayApiError) -> bool {
    if let RelayApiError::WebSocket(tungstenite::Error::Http(response)) = error {
        is_auth_failure_status(response.status().as_u16())
    } else {
        false
    }
}

#[allow(clippy::result_large_err)]
fn unix_timestamp_now() -> Result<i64, RelayApiError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| RelayApiError::Other("system time before unix epoch".to_string()))?;
    i64::try_from(duration.as_secs())
        .map_err(|e| RelayApiError::Other(format!("unix timestamp overflow: {e}")))
}

#[derive(Debug, Clone, Deserialize)]
struct CreateRelaySessionResponse {
    session_id: Uuid,
}

#[derive(Debug, Deserialize)]
struct RelayApiResponse<T> {
    data: T,
}
