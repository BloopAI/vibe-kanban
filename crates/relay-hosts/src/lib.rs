use std::{collections::HashMap, io, pin::Pin, sync::Arc};

use bytes::Bytes;
use chrono::Utc;
use futures_util::{Sink, Stream, StreamExt, stream};
use http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, header};
pub use relay_client::RelayApiError;
use relay_client::{RelayApiClient, RelayHostIdentity, RelayHostTransport};
use relay_control::signing::RelaySigningService;
use relay_types::{PairRelayHostRequest, RelayAuthState, RelayPairedHost, RemoteSession};
use relay_webrtc::{DataChannelWsStream, WebRtcClient};
use relay_ws::SignedTungsteniteSocket;
use remote_info::RemoteInfo;
use serde::{Deserialize, Serialize};
use services::services::remote_client::{RemoteClient, RemoteClientError};
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use trusted_key_auth::trusted_keys::parse_public_key_base64;
use utils::assets::relay_host_credentials_path;
use uuid::Uuid;

mod tunnel_manager;
mod webrtc_cache;
use tunnel_manager::TunnelManager;
use webrtc_cache::WebRtcConnectionCache;

#[derive(Debug, Clone, Default)]
struct RelaySessionCacheEntry {
    remote_session_id: Option<Uuid>,
    signing_session_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RelayHostCredentials {
    pub host_name: Option<String>,
    pub paired_at: Option<String>,
    pub client_id: Option<String>,
    pub server_public_key_b64: Option<String>,
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum RelayHostLookupError {
    #[error("No paired relay credentials for this host")]
    NotPaired,
    #[error("This host pairing is missing required client metadata. Re-pair it.")]
    MissingClientMetadata,
    #[error("This host pairing is missing required signing metadata. Re-pair it.")]
    MissingSigningMetadata,
}

#[derive(Debug, thiserror::Error)]
pub enum RelayConnectionError {
    #[error("Remote relay API is not configured")]
    NotConfigured,
    #[error(transparent)]
    RemoteClient(#[from] RemoteClientError),
    #[error(transparent)]
    Relay(#[from] RelayApiError),
}

#[derive(Debug, thiserror::Error)]
enum NegotiateWebRtcError {
    #[error(transparent)]
    WebRtcClient(#[from] relay_webrtc::WebRtcClientError),
    #[error("Failed to serialize WebRTC offer: {0}")]
    SerializeOffer(#[from] serde_json::Error),
    #[error(transparent)]
    Relay(#[from] RelayApiError),
    #[error("WebRTC offer rejected with status {0}")]
    OfferRejected(StatusCode),
    #[error("Invalid WebRTC answer response: {0}")]
    InvalidAnswerResponse(reqwest::Error),
}

#[derive(Clone)]
struct RelayHostRepository {
    credentials: Arc<RwLock<HashMap<Uuid, RelayHostCredentials>>>,
}

impl RelayHostRepository {
    async fn load() -> Self {
        Self {
            credentials: Arc::new(RwLock::new(load_relay_host_credentials_map().await)),
        }
    }

    pub async fn upsert_credentials(
        &self,
        host_id: Uuid,
        host_name: Option<String>,
        paired_at: Option<String>,
        client_id: Option<String>,
        server_public_key_b64: Option<String>,
    ) -> Result<(), RelayPairingClientError> {
        let mut credentials = self.credentials.write().await;
        let existing = credentials.get(&host_id).cloned();
        credentials.insert(
            host_id,
            RelayHostCredentials {
                host_name: host_name
                    .or_else(|| existing.as_ref().and_then(|value| value.host_name.clone())),
                paired_at: paired_at
                    .or_else(|| existing.as_ref().and_then(|value| value.paired_at.clone())),
                client_id: client_id
                    .or_else(|| existing.as_ref().and_then(|value| value.client_id.clone())),
                server_public_key_b64: server_public_key_b64.or_else(|| {
                    existing
                        .as_ref()
                        .and_then(|value| value.server_public_key_b64.clone())
                }),
            },
        );

        persist_relay_host_credentials_map(&credentials).await
    }

    pub async fn list_hosts(&self) -> Vec<RelayPairedHost> {
        self.credentials
            .read()
            .await
            .iter()
            .map(|(host_id, value)| RelayPairedHost {
                host_id: *host_id,
                host_name: value.host_name.clone(),
                paired_at: value.paired_at.clone(),
            })
            .collect()
    }

    pub async fn remove_credentials(&self, host_id: Uuid) -> Result<bool, RelayPairingClientError> {
        let mut credentials = self.credentials.write().await;
        let removed = credentials.remove(&host_id).is_some();

        if removed {
            persist_relay_host_credentials_map(&credentials).await?;
        }

        Ok(removed)
    }

    pub async fn load_identity(
        &self,
        host_id: Uuid,
    ) -> Result<RelayHostIdentity, RelayHostLookupError> {
        let credentials = self
            .credentials
            .read()
            .await
            .get(&host_id)
            .cloned()
            .ok_or(RelayHostLookupError::NotPaired)?;

        let client_id = credentials
            .client_id
            .as_ref()
            .and_then(|value| value.parse::<Uuid>().ok())
            .ok_or(RelayHostLookupError::MissingClientMetadata)?;
        let server_verify_key = credentials
            .server_public_key_b64
            .as_deref()
            .and_then(|key| parse_public_key_base64(key).ok())
            .ok_or(RelayHostLookupError::MissingSigningMetadata)?;

        Ok(RelayHostIdentity {
            host_id,
            client_id,
            server_verify_key,
        })
    }
}

#[derive(Clone, Default)]
struct RelaySessionCache {
    auth_state: Arc<RwLock<HashMap<Uuid, RelaySessionCacheEntry>>>,
}

impl RelaySessionCache {
    pub async fn load_auth_state(&self, host_id: Uuid) -> Option<RelayAuthState> {
        let sessions = self.auth_state.read().await;
        let entry = sessions.get(&host_id)?;
        let remote_session_id = entry.remote_session_id?;
        let signing_session_id = entry.signing_session_id?;

        Some(RelayAuthState {
            remote_session: RemoteSession {
                host_id,
                id: remote_session_id,
            },
            signing_session_id,
        })
    }

    pub async fn cache_auth_state(&self, host_id: Uuid, auth_state: &RelayAuthState) {
        let mut sessions = self.auth_state.write().await;
        let entry = sessions.entry(host_id).or_default();
        entry.remote_session_id = Some(auth_state.remote_session.id);
        entry.signing_session_id = Some(auth_state.signing_session_id);
    }

    pub async fn cache_signing_session_id(&self, host_id: Uuid, session_id: Uuid) {
        self.auth_state
            .write()
            .await
            .entry(host_id)
            .or_default()
            .signing_session_id = Some(session_id);
    }

    pub async fn clear(&self, host_id: Uuid) {
        self.auth_state.write().await.remove(&host_id);
    }
}

pub type ProxiedBodyStream = Pin<Box<dyn Stream<Item = Result<Bytes, io::Error>> + Send>>;

/// Normalized HTTP response returned from relay-hosts, independent of whether
/// the upstream transport was relay or WebRTC.
pub struct ProxiedResponse {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: ProxiedBodyStream,
}

#[derive(Clone)]
pub struct RelayHosts {
    repository: RelayHostRepository,
    sessions: RelaySessionCache,
    runtime: RelayRuntime,
    webrtc: WebRtcConnectionCache,
}

#[derive(Clone)]
struct RelayRuntime {
    remote_client: RemoteClient,
    remote_info: RemoteInfo,
    relay_signing: RelaySigningService,
    tunnel_manager: TunnelManager,
}

#[derive(Clone)]
pub struct RelayHost {
    identity: RelayHostIdentity,
    sessions: RelaySessionCache,
    runtime: RelayRuntime,
    webrtc: WebRtcConnectionCache,
}

/// A WebSocket connection proxied upstream (via relay, WebRTC, etc.).
pub struct ProxiedWsConnection {
    pub selected_protocol: Option<String>,
    upstream: UpstreamWs,
}

/// The upstream WebSocket transport, either via the relay or a direct WebRTC
/// data channel.
enum UpstreamWs {
    Relay(Box<SignedTungsteniteSocket>),
    WebRtc(DataChannelWsStream),
}

impl ProxiedWsConnection {
    pub async fn bridge<MC, EC, C>(
        self,
        client_socket: C,
        client_to_upstream: fn(MC) -> tokio_tungstenite::tungstenite::Message,
        upstream_to_client: fn(tokio_tungstenite::tungstenite::Message) -> MC,
    ) -> Result<(), ws_bridge::WsBridgeError>
    where
        C: Stream<Item = Result<MC, EC>> + Sink<MC, Error = EC> + Unpin,
        EC: std::error::Error + Send + Sync + 'static,
    {
        match self.upstream {
            UpstreamWs::Relay(socket) => {
                ws_bridge::ws_copy_bidirectional(
                    client_socket,
                    *socket,
                    client_to_upstream,
                    upstream_to_client,
                )
                .await?;
            }
            UpstreamWs::WebRtc(stream) => {
                ws_bridge::ws_copy_bidirectional(
                    stream,
                    client_socket,
                    upstream_to_client,
                    client_to_upstream,
                )
                .await?;
            }
        }

        Ok(())
    }

    pub async fn bridge_tcp(self, mut tcp_stream: tokio::net::TcpStream) -> Result<(), io::Error> {
        match self.upstream {
            UpstreamWs::Relay(socket) => {
                let mut ws_io = ws_bridge::tungstenite_ws_stream_io(*socket);
                tokio::io::copy_bidirectional(&mut tcp_stream, &mut ws_io).await?;
            }
            UpstreamWs::WebRtc(stream) => {
                let mut ws_io = ws_bridge::tungstenite_ws_stream_io(stream);
                tokio::io::copy_bidirectional(&mut tcp_stream, &mut ws_io).await?;
            }
        }

        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum OpenRemoteEditorError {
    #[error(transparent)]
    Connection(#[from] RelayConnectionError),
    #[error("Failed to create SSH tunnel: {0}")]
    CreateTunnel(std::io::Error),
}

impl From<RelayApiError> for OpenRemoteEditorError {
    fn from(err: RelayApiError) -> Self {
        Self::Connection(err.into())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum RelayPairingClientError {
    #[error("Remote relay API is not configured")]
    NotConfigured,
    #[error("Relay host pairing authentication failed: {0}")]
    RemoteClient(#[from] RemoteClientError),
    #[error("Relay host pairing failed: {0}")]
    Pairing(RelayApiError),
    #[error("Failed to serialize relay host credentials: {0}")]
    StoreSerialization(serde_json::Error),
    #[error("Failed to persist relay host credentials: {0}")]
    Store(std::io::Error),
}

#[derive(Debug, Clone, Deserialize)]
struct RelayEditorPathResponse {
    workspace_path: String,
}

#[derive(Debug, Clone)]
pub struct WorkspaceEditorSetup {
    pub workspace_path: String,
    pub local_port: u16,
}

impl RelayHosts {
    pub async fn load(
        remote_client: RemoteClient,
        remote_info: RemoteInfo,
        relay_signing: RelaySigningService,
    ) -> Self {
        Self {
            repository: RelayHostRepository::load().await,
            sessions: RelaySessionCache::default(),
            runtime: RelayRuntime {
                remote_client,
                remote_info,
                relay_signing,
                tunnel_manager: TunnelManager::default(),
            },
            webrtc: WebRtcConnectionCache::default(),
        }
    }

    pub async fn host(&self, host_id: Uuid) -> Result<RelayHost, RelayHostLookupError> {
        let identity = self.repository.load_identity(host_id).await?;
        Ok(RelayHost {
            identity,
            sessions: self.sessions.clone(),
            runtime: self.runtime.clone(),
            webrtc: self.webrtc.clone(),
        })
    }

    pub async fn pair_host(
        &self,
        req: &PairRelayHostRequest,
    ) -> Result<(), RelayPairingClientError> {
        let remote_client = self.runtime.remote_client.clone();
        let relay_base_url = self
            .runtime
            .remote_info
            .get_relay_api_base()
            .ok_or(RelayPairingClientError::NotConfigured)?;
        let access_token = remote_client.access_token().await?;
        let relay_client = RelayApiClient::new(
            relay_base_url,
            access_token,
            self.runtime.relay_signing.clone(),
        )
        .map_err(RelayPairingClientError::Pairing)?;
        let relay_client::PairRelayHostResult {
            signing_session_id,
            client_id,
            server_public_key_b64,
        } = relay_client
            .pair_host(req)
            .await
            .map_err(RelayPairingClientError::Pairing)?;

        self.repository
            .upsert_credentials(
                req.host_id,
                Some(req.host_name.clone()),
                Some(Utc::now().to_rfc3339()),
                Some(client_id.to_string()),
                Some(server_public_key_b64),
            )
            .await?;
        self.sessions
            .cache_signing_session_id(req.host_id, signing_session_id)
            .await;
        Ok(())
    }

    pub async fn list_hosts(&self) -> Vec<RelayPairedHost> {
        let mut hosts = self.repository.list_hosts().await;
        hosts.sort_by(|a, b| b.paired_at.cmp(&a.paired_at));
        hosts
    }

    pub async fn remove_host(&self, host_id: Uuid) -> Result<bool, RelayPairingClientError> {
        let removed = self.repository.remove_credentials(host_id).await?;
        if removed {
            self.sessions.clear(host_id).await;
            self.webrtc.remove(host_id).await;
        }
        Ok(removed)
    }
}

impl RelayHost {
    async fn open_relay_transport(&self) -> Result<RelayHostTransport, RelayConnectionError> {
        let remote_client = self.runtime.remote_client.clone();
        let relay_base_url = self
            .runtime
            .remote_info
            .get_relay_api_base()
            .ok_or(RelayConnectionError::NotConfigured)?;
        let access_token = remote_client.access_token().await?;
        let cached_auth_state = self.sessions.load_auth_state(self.identity.host_id).await;
        let relay_client = RelayApiClient::new(
            relay_base_url,
            access_token,
            self.runtime.relay_signing.clone(),
        )?;
        let transport = RelayHostTransport::bootstrap(
            relay_client,
            self.identity.clone(),
            cached_auth_state
                .as_ref()
                .map(|value| value.remote_session.clone()),
            cached_auth_state.map(|value| value.signing_session_id),
        )
        .await?;

        Ok(transport)
    }

    async fn send_http_via_relay(
        &self,
        method: &Method,
        target_path: &str,
        headers: &HeaderMap,
        body: &[u8],
    ) -> Result<ProxiedResponse, RelayConnectionError> {
        let mut transport = self.open_relay_transport().await?;
        let result = transport
            .send_http(method, target_path, headers, body)
            .await;
        self.persist_auth_state(&transport).await;
        if result.is_ok() {
            self.maybe_start_webrtc(transport).await;
        }
        let response = result.map_err(RelayConnectionError::from)?;
        let status = response.status();
        let headers = response.headers().clone();
        let body = Box::pin(
            response
                .bytes_stream()
                .map(|chunk| chunk.map_err(|e| io::Error::other(e.to_string()))),
        );

        Ok(ProxiedResponse {
            status,
            headers,
            body,
        })
    }

    async fn connect_ws_via_relay(
        &self,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Result<ProxiedWsConnection, RelayConnectionError> {
        let mut transport = self.open_relay_transport().await?;
        let result = transport.connect_ws(target_path, protocols).await;
        self.persist_auth_state(&transport).await;
        if result.is_ok() {
            self.maybe_start_webrtc(transport).await;
        }
        let (upstream_socket, selected_protocol) = result.map_err(RelayConnectionError::from)?;
        Ok(ProxiedWsConnection {
            selected_protocol,
            upstream: UpstreamWs::Relay(Box::new(upstream_socket)),
        })
    }

    async fn persist_auth_state(&self, transport: &RelayHostTransport) {
        self.sessions
            .cache_auth_state(self.identity.host_id, transport.auth_state())
            .await;
    }

    pub async fn proxy_http(
        &self,
        method: &Method,
        target_path: &str,
        headers: &HeaderMap,
        body: &[u8],
    ) -> Result<ProxiedResponse, RelayConnectionError> {
        // Try direct WebRTC data channel first.
        if let Some(response) = self
            .try_webrtc_proxy(method, target_path, headers, body)
            .await
        {
            return Ok(response);
        }

        self.send_http_via_relay(method, target_path, headers, body)
            .await
    }

    /// Try to proxy through an active WebRTC data channel. Returns `None`
    /// if there's no active connection or the request fails.
    async fn try_webrtc_proxy(
        &self,
        method: &Method,
        target_path: &str,
        headers: &HeaderMap,
        body: &[u8],
    ) -> Option<ProxiedResponse> {
        let client = self.webrtc.get(self.identity.host_id).await?;
        if !client.is_connected() {
            self.webrtc.remove(self.identity.host_id).await;
            return None;
        }

        let mut header_map = HashMap::new();
        for (key, value) in headers {
            if let Ok(v) = value.to_str() {
                header_map.insert(key.to_string(), v.to_string());
            }
        }

        let body_vec = if body.is_empty() {
            None
        } else {
            Some(body.to_vec())
        };

        match client
            .send_request(method.as_ref(), target_path, header_map, body_vec)
            .await
        {
            Ok(response) => {
                let body = if let Some(body_b64) = &response.body_b64 {
                    use base64::Engine as _;
                    match base64::engine::general_purpose::STANDARD.decode(body_b64) {
                        Ok(bytes) => bytes,
                        Err(e) => {
                            tracing::debug!(
                                ?e,
                                host_id = %self.identity.host_id,
                                "Invalid WebRTC HTTP response body encoding, falling back to relay"
                            );
                            self.webrtc.remove(self.identity.host_id).await;
                            return None;
                        }
                    }
                } else {
                    Vec::new()
                };

                let status =
                    StatusCode::from_u16(response.status).unwrap_or(StatusCode::BAD_GATEWAY);
                let mut header_map = HeaderMap::new();
                for (name, value) in response.headers {
                    let Ok(name) = HeaderName::from_bytes(name.as_bytes()) else {
                        continue;
                    };
                    let Ok(value) = HeaderValue::from_str(&value) else {
                        continue;
                    };
                    header_map.append(name, value);
                }

                Some(ProxiedResponse {
                    status,
                    headers: header_map,
                    body: Box::pin(stream::once(async move { Ok(Bytes::from(body)) })),
                })
            }
            Err(e) => {
                tracing::debug!(?e, host_id = %self.identity.host_id, "WebRTC request failed, falling back to relay");
                self.webrtc.remove(self.identity.host_id).await;
                None
            }
        }
    }

    /// Kick off a background WebRTC handshake if we don't already have a
    /// direct connection to this host. Reuses the provided transport so
    /// no extra relay sessions are created.
    async fn maybe_start_webrtc(&self, transport: RelayHostTransport) {
        let host_id = self.identity.host_id;

        if !self.webrtc.start_connecting(host_id).await {
            return;
        }

        let webrtc = self.webrtc.clone();

        tokio::spawn(async move {
            match negotiate_webrtc(transport).await {
                Ok(client)
                    if client
                        .wait_until_connected(std::time::Duration::from_secs(5))
                        .await =>
                {
                    webrtc.insert(host_id, Arc::new(client)).await;
                    tracing::debug!(%host_id, "WebRTC direct connection established");
                }
                Ok(client) => {
                    tracing::debug!(
                        %host_id,
                        "WebRTC data channel did not open before timeout"
                    );
                    client.shutdown();
                    webrtc.mark_failed(host_id).await;
                }
                Err(e) => {
                    tracing::debug!(?e, %host_id, "WebRTC handshake failed (relay fallback active)");
                    webrtc.mark_failed(host_id).await;
                }
            }
        });
    }

    pub async fn proxy_ws(
        &self,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Result<ProxiedWsConnection, RelayConnectionError> {
        // Try direct WebRTC data channel first.
        if let Some(conn) = self.try_webrtc_ws(target_path, protocols).await {
            return Ok(conn);
        }

        self.connect_ws_via_relay(target_path, protocols).await
    }

    /// Try to open a WebSocket through an active WebRTC data channel.
    async fn try_webrtc_ws(
        &self,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Option<ProxiedWsConnection> {
        let client = self.webrtc.get(self.identity.host_id).await?;
        if !client.is_connected() {
            self.webrtc.remove(self.identity.host_id).await;
            return None;
        }

        match client.open_ws(target_path, protocols).await {
            Ok(ws_connection) => {
                let selected_protocol = ws_connection.selected_protocol.clone();
                Some(ProxiedWsConnection {
                    selected_protocol,
                    upstream: UpstreamWs::WebRtc(ws_connection.into_ws_stream()),
                })
            }
            Err(e) => {
                tracing::debug!(
                    ?e,
                    host_id = %self.identity.host_id,
                    "WebRTC WS open failed, falling back to relay"
                );
                None
            }
        }
    }

    pub async fn prepare_workspace_editor(
        &self,
        workspace_id: Uuid,
        file_path: Option<&str>,
    ) -> Result<WorkspaceEditorSetup, OpenRemoteEditorError> {
        let editor_path_api_path = build_workspace_editor_path_api_path(workspace_id, file_path);
        let editor_path = self.resolve_editor_path(&editor_path_api_path).await?;
        let local_port = self.create_ssh_tunnel_port().await?;

        Ok(WorkspaceEditorSetup {
            workspace_path: editor_path.workspace_path,
            local_port,
        })
    }

    async fn resolve_editor_path(
        &self,
        editor_path_api_path: &str,
    ) -> Result<RelayEditorPathResponse, OpenRemoteEditorError> {
        if let Some(path) = self
            .try_webrtc_resolve_editor_path(editor_path_api_path)
            .await
        {
            return Ok(path);
        }

        let response = self
            .send_http_via_relay(&Method::GET, editor_path_api_path, &HeaderMap::new(), &[])
            .await
            .map_err(OpenRemoteEditorError::from)?;
        parse_editor_path_response(response)
            .await
            .map_err(OpenRemoteEditorError::from)
    }

    /// Resolve editor path via WebRTC HTTP. Returns None when WebRTC is not
    /// available or the response is invalid.
    async fn try_webrtc_resolve_editor_path(
        &self,
        editor_path_api_path: &str,
    ) -> Option<RelayEditorPathResponse> {
        let response = self
            .try_webrtc_proxy(&Method::GET, editor_path_api_path, &HeaderMap::new(), &[])
            .await?;
        match parse_editor_path_response(response).await {
            Ok(path) => Some(path),
            Err(error) => {
                tracing::debug!(
                    ?error,
                    "WebRTC editor path request invalid, falling back to relay"
                );
                None
            }
        }
    }

    async fn create_ssh_tunnel_port(&self) -> Result<u16, OpenRemoteEditorError> {
        self.runtime
            .tunnel_manager
            .get_or_create_ssh_tunnel(self.clone())
            .await
            .map_err(OpenRemoteEditorError::CreateTunnel)
    }
}

/// Negotiate a WebRTC data channel with the remote host via the relay.
///
/// Reuses an already-authenticated transport from the caller so no extra
/// relay sessions are created and no shared session cache is touched.
async fn negotiate_webrtc(
    mut transport: RelayHostTransport,
) -> Result<WebRtcClient, NegotiateWebRtcError> {
    let session_id = Uuid::new_v4().to_string();
    let webrtc_offer = WebRtcClient::create_offer(session_id).await?;

    let offer_json = serde_json::to_vec(&webrtc_offer.offer)?;
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );

    let response = transport
        .send_http(&Method::POST, "/api/webrtc/offer", &headers, &offer_json)
        .await?;

    if !response.status().is_success() {
        return Err(NegotiateWebRtcError::OfferRejected(response.status()));
    }

    let answer: relay_webrtc::SdpAnswer = response
        .json()
        .await
        .map_err(NegotiateWebRtcError::InvalidAnswerResponse)?;

    let shutdown = CancellationToken::new();
    let client = WebRtcClient::connect(webrtc_offer, &answer.sdp, shutdown).await?;
    Ok(client)
}

fn build_workspace_editor_path_api_path(workspace_id: Uuid, file_path: Option<&str>) -> String {
    let base = format!("/api/workspaces/{workspace_id}/integration/editor/path");
    let Some(file_path) = file_path.filter(|value| !value.is_empty()) else {
        return base;
    };

    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("file_path", file_path)
        .finish();
    format!("{base}?{query}")
}

async fn parse_editor_path_response(
    mut response: ProxiedResponse,
) -> Result<RelayEditorPathResponse, RelayApiError> {
    if response.status != StatusCode::OK {
        return Err(RelayApiError::Other(format!(
            "editor path request failed with status {}",
            response.status
        )));
    }

    let mut response_body = Vec::new();
    while let Some(chunk) = response.body.next().await {
        let chunk = chunk.map_err(|error| {
            RelayApiError::Other(format!("failed to read response body: {error}"))
        })?;
        response_body.extend_from_slice(&chunk);
    }

    serde_json::from_slice::<RelayEditorPathResponse>(&response_body)
        .map_err(|error| RelayApiError::Other(format!("failed to parse response body: {error}")))
}

async fn load_relay_host_credentials_map() -> HashMap<Uuid, RelayHostCredentials> {
    let path = relay_host_credentials_path();
    let Ok(raw) = tokio::fs::read_to_string(&path).await else {
        return HashMap::new();
    };

    match serde_json::from_str::<HashMap<Uuid, RelayHostCredentials>>(&raw) {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(
                ?error,
                path = %path.display(),
                "Failed to parse relay host credentials file"
            );
            HashMap::new()
        }
    }
}

async fn persist_relay_host_credentials_map(
    map: &HashMap<Uuid, RelayHostCredentials>,
) -> Result<(), RelayPairingClientError> {
    let path = relay_host_credentials_path();
    let json =
        serde_json::to_string_pretty(map).map_err(RelayPairingClientError::StoreSerialization)?;
    tokio::fs::write(&path, json)
        .await
        .map_err(RelayPairingClientError::Store)?;
    Ok(())
}
