use std::{collections::HashMap, io, pin::Pin, sync::Arc};

use axum::extract::ws::WebSocket as AxumWebSocket;
use bytes::Bytes;
use chrono::Utc;
use futures_util::{Stream, StreamExt, stream};
use http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, header};
pub use relay_client::RelayApiError;
use relay_client::{RelayApiClient, RelayHostIdentity, RelayHostTransport};
use relay_control::signing::RelaySigningService;
use relay_types::{PairRelayHostRequest, RelayAuthState, RelayPairedHost, RemoteSession};
use relay_webrtc::{DataChannelResponse, DataChannelWsStream, WebRtcClient};
use relay_ws::SignedTungsteniteSocket;
use remote_info::RemoteInfo;
use serde::{Deserialize, Serialize};
use services::services::remote_client::{RemoteClient, RemoteClientError};
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use trusted_key_auth::trusted_keys::parse_public_key_base64;
use utils::{assets::relay_host_credentials_path, response::ApiResponse};
use uuid::Uuid;

mod tunnel_manager;
mod webrtc_cache;
use tunnel_manager::TunnelManager;
use webrtc_cache::WebRtcConnectionCache;
use ws_bridge::{WsBridgeError, bridge_axum_ws, tungstenite_ws_stream_io};

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
    #[error(transparent)]
    Serialize(#[from] serde_json::Error),
    #[error(transparent)]
    Relay(#[from] RelayApiError),
    #[error("WebRTC offer rejected with status {0}")]
    OfferRejected(StatusCode),
    #[error(transparent)]
    AnswerResponse(#[from] reqwest::Error),
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

    async fn upsert_credentials(
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

    async fn list_hosts(&self) -> Vec<RelayPairedHost> {
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

    async fn remove_credentials(&self, host_id: Uuid) -> Result<bool, RelayPairingClientError> {
        let mut credentials = self.credentials.write().await;
        let removed = credentials.remove(&host_id).is_some();

        if removed {
            persist_relay_host_credentials_map(&credentials).await?;
        }

        Ok(removed)
    }

    async fn load_identity(
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
    async fn load_auth_state(&self, host_id: Uuid) -> Option<RelayAuthState> {
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

    async fn cache_auth_state(&self, host_id: Uuid, auth_state: &RelayAuthState) {
        let mut sessions = self.auth_state.write().await;
        let entry = sessions.entry(host_id).or_default();
        entry.remote_session_id = Some(auth_state.remote_session.id);
        entry.signing_session_id = Some(auth_state.signing_session_id);
    }

    async fn cache_signing_session_id(&self, host_id: Uuid, session_id: Uuid) {
        self.auth_state
            .write()
            .await
            .entry(host_id)
            .or_default()
            .signing_session_id = Some(session_id);
    }

    async fn clear(&self, host_id: Uuid) {
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
    pub async fn bridge(self, client_socket: AxumWebSocket) -> Result<(), WsBridgeError> {
        match self.upstream {
            UpstreamWs::Relay(socket) => bridge_axum_ws(client_socket, socket).await?,
            UpstreamWs::WebRtc(stream) => bridge_axum_ws(client_socket, stream).await?,
        }

        Ok(())
    }

    pub async fn bridge_tcp(self, mut tcp_stream: tokio::net::TcpStream) -> Result<(), io::Error> {
        match self.upstream {
            UpstreamWs::Relay(socket) => {
                let mut ws_io = tungstenite_ws_stream_io(socket);
                tokio::io::copy_bidirectional(&mut tcp_stream, &mut ws_io).await?;
            }
            UpstreamWs::WebRtc(stream) => {
                let mut ws_io = tungstenite_ws_stream_io(stream);
                tokio::io::copy_bidirectional(&mut tcp_stream, &mut ws_io).await?;
            }
        }

        Ok(())
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

impl RelayHosts {
    pub async fn load(
        remote_client: RemoteClient,
        remote_info: RemoteInfo,
        relay_signing: RelaySigningService,
        shutdown: CancellationToken,
    ) -> Self {
        Self {
            repository: RelayHostRepository::load().await,
            sessions: RelaySessionCache::default(),
            runtime: RelayRuntime {
                remote_client,
                remote_info,
                relay_signing,
                tunnel_manager: TunnelManager::new(shutdown.clone()),
            },
            webrtc: WebRtcConnectionCache::new(shutdown),
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
            self.runtime.tunnel_manager.cancel_tunnel(host_id).await;
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
    /// if there's no active connection or the request fails. On failure the
    /// client marks itself as disconnected so the cache skips it next time.
    async fn try_webrtc_proxy(
        &self,
        method: &Method,
        target_path: &str,
        headers: &HeaderMap,
        body: &[u8],
    ) -> Option<ProxiedResponse> {
        let client = self.webrtc.get(self.identity.host_id).await?;

        let mut header_map: HashMap<String, Vec<String>> = HashMap::new();
        for (key, value) in headers {
            if let Ok(v) = value.to_str() {
                header_map
                    .entry(key.to_string())
                    .or_default()
                    .push(v.to_string());
            }
        }

        let body_vec = if body.is_empty() {
            None
        } else {
            Some(body.to_vec())
        };

        let response = client
            .send_request(method.as_ref(), target_path, header_map, body_vec)
            .await
            .ok()?;

        decode_webrtc_http_response(response)
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
        let panic_webrtc = webrtc.clone();
        let shutdown = self.webrtc.child_token();

        let handle = tokio::spawn(async move {
            match negotiate_webrtc(transport, shutdown).await {
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
                    client.shutdown().await;
                    webrtc.mark_failed(host_id).await;
                }
                Err(e) => {
                    tracing::debug!(?e, %host_id, "WebRTC handshake failed (relay fallback active)");
                    webrtc.mark_failed(host_id).await;
                }
            }
        });

        // If the spawned task panics, ensure the cache transitions out of
        // `Connecting` so future attempts are not permanently blocked.
        tokio::spawn(async move {
            if handle.await.is_err() {
                tracing::warn!(%host_id, "WebRTC negotiation task panicked, marking as failed");
                panic_webrtc.mark_failed(host_id).await;
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
        let ws = match client.open_ws(target_path, protocols).await {
            Ok(Ok(conn)) => conn,
            Ok(Err(reason)) => {
                tracing::debug!(
                    host_id = %self.identity.host_id,
                    %reason,
                    "Remote host WS open failed, falling back to relay"
                );
                return None;
            }
            Err(e) => {
                tracing::debug!(
                    ?e,
                    host_id = %self.identity.host_id,
                    "WebRTC WS transport error, falling back to relay"
                );
                return None;
            }
        };
        let selected_protocol = ws.selected_protocol.clone();
        Some(ProxiedWsConnection {
            selected_protocol,
            upstream: UpstreamWs::WebRtc(ws.into_ws_stream()),
        })
    }

    pub async fn get_or_create_ssh_tunnel(&self) -> std::io::Result<u16> {
        self.runtime
            .tunnel_manager
            .get_or_create_ssh_tunnel(self.clone())
            .await
    }
}

/// Decode a WebRTC data channel HTTP response into a `ProxiedResponse`.
fn decode_webrtc_http_response(response: DataChannelResponse) -> Option<ProxiedResponse> {
    let body = if let Some(body_b64) = &response.body_b64 {
        use base64::Engine as _;
        match base64::engine::general_purpose::STANDARD.decode(body_b64) {
            Ok(bytes) => bytes,
            Err(e) => {
                tracing::debug!(
                    ?e,
                    "Invalid WebRTC HTTP response body encoding, falling back to relay"
                );
                return None;
            }
        }
    } else {
        Vec::new()
    };

    let status = StatusCode::from_u16(response.status).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut headers = HeaderMap::new();
    for (name, values) in response.headers {
        let Ok(name) = HeaderName::from_bytes(name.as_bytes()) else {
            continue;
        };
        for v in values {
            let Ok(value) = HeaderValue::from_str(&v) else {
                continue;
            };
            headers.append(name.clone(), value);
        }
    }

    Some(ProxiedResponse {
        status,
        headers,
        body: Box::pin(stream::once(async move { Ok(Bytes::from(body)) })),
    })
}

/// Negotiate a WebRTC data channel with the remote host via the relay.
///
/// Reuses an already-authenticated transport from the caller so no extra
/// relay sessions are created and no shared session cache is touched.
async fn negotiate_webrtc(
    mut transport: RelayHostTransport,
    shutdown: CancellationToken,
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

    let answer_response: ApiResponse<relay_webrtc::SdpAnswer> = response.json().await?;
    if !answer_response.is_success() {
        let message = answer_response
            .message()
            .unwrap_or("WebRTC offer failed")
            .to_string();
        return Err(NegotiateWebRtcError::Relay(RelayApiError::Other(message)));
    }

    let answer = answer_response.into_data().ok_or_else(|| {
        NegotiateWebRtcError::Relay(RelayApiError::Other(
            "WebRTC offer response missing SDP answer".to_string(),
        ))
    })?;

    let client = WebRtcClient::connect(webrtc_offer, &answer.sdp, shutdown).await?;
    Ok(client)
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
