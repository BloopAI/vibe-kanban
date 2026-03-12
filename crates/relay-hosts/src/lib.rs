use std::{collections::HashMap, sync::Arc};

use anyhow::Context as _;
use chrono::Utc;
use desktop_bridge::{service::OpenRemoteEditorResponse, tunnel::TunnelManager};
use ed25519_dalek::{SigningKey, VerifyingKey};
use http::{HeaderMap, Method};
use relay_client::{
    RelayApiClient, RelayHostIdentity, RelayHostTransport, RelayTransportBootstrapError,
    RelayTransportError,
};
use relay_control::{
    signed_ws::{UpstreamWsReceiver, UpstreamWsSender},
    signing::RelaySigningService,
};
use relay_types::{PairRelayHostRequest, RelayAuthState, RelayPairedHost, RemoteSession};
use relay_webrtc::WebRtcClient;
use remote_info::RemoteInfo;
use serde::{Deserialize, Serialize};
use services::services::remote_client::RemoteClient;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use trusted_key_auth::trusted_keys::parse_public_key_base64;
use utils::assets::relay_host_credentials_path;
use uuid::Uuid;

#[derive(Debug, Clone, Default)]
struct RelaySessionCacheEntry {
    remote_session_id: Option<Uuid>,
    signing_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RelayHostCredentials {
    pub host_name: Option<String>,
    pub paired_at: Option<String>,
    pub client_id: Option<String>,
    pub server_public_key_b64: Option<String>,
}

#[derive(Debug, Clone)]
pub enum RelayHostLookupError {
    NotPaired,
    MissingClientMetadata,
    MissingSigningMetadata,
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
    ) -> anyhow::Result<()> {
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

    pub async fn remove_credentials(&self, host_id: Uuid) -> anyhow::Result<bool> {
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
        let signing_session_id = entry.signing_session_id.clone()?;

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
        entry.signing_session_id = Some(auth_state.signing_session_id.clone());
    }

    pub async fn cache_signing_session_id(&self, host_id: Uuid, session_id: String) {
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

/// State of a WebRTC connection for a single host.
enum WebRtcHostState {
    /// Handshake is in progress.
    Connecting,
    /// Connection established.
    Connected(Arc<WebRtcClient>),
    /// Negotiation failed — prevents infinite retry loops.
    Failed,
}

/// Cache of active WebRTC direct connections keyed by host ID.
#[derive(Clone, Default)]
struct WebRtcConnectionCache {
    hosts: Arc<RwLock<HashMap<Uuid, WebRtcHostState>>>,
}

impl WebRtcConnectionCache {
    async fn get(&self, host_id: Uuid) -> Option<Arc<WebRtcClient>> {
        match self.hosts.read().await.get(&host_id) {
            Some(WebRtcHostState::Connected(client)) => Some(client.clone()),
            _ => None,
        }
    }

    async fn insert(&self, host_id: Uuid, client: Arc<WebRtcClient>) {
        self.hosts
            .write()
            .await
            .insert(host_id, WebRtcHostState::Connected(client));
    }

    async fn remove(&self, host_id: Uuid) {
        if let Some(WebRtcHostState::Connected(client)) = self.hosts.write().await.remove(&host_id)
        {
            client.shutdown();
        }
    }

    /// Try to mark a host as "connecting". Returns false if already connected,
    /// a handshake is already in progress, or a previous handshake failed.
    async fn start_connecting(&self, host_id: Uuid) -> bool {
        use std::collections::hash_map::Entry;
        let mut hosts = self.hosts.write().await;
        match hosts.entry(host_id) {
            Entry::Occupied(_) => false,
            Entry::Vacant(e) => {
                e.insert(WebRtcHostState::Connecting);
                true
            }
        }
    }

    async fn mark_failed(&self, host_id: Uuid) {
        self.hosts
            .write()
            .await
            .insert(host_id, WebRtcHostState::Failed);
    }
}

/// Response from [`RelayHost::proxy_http`], which may come from the relay
/// or from a direct WebRTC data channel.
pub enum ProxiedResponse {
    /// Response received through the relay proxy.
    Relay(reqwest::Response),
    /// Response received directly via WebRTC data channel.
    Direct(DirectProxyResponse),
}

/// An HTTP response received over a WebRTC data channel.
pub struct DirectProxyResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
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
    pub sender: Box<dyn UpstreamWsSender>,
    pub receiver: Box<dyn UpstreamWsReceiver>,
}

#[derive(Debug)]
pub enum HostRelayProxyError {
    RelayNotConfigured,
    Authentication(anyhow::Error),
    Upstream(anyhow::Error),
    SigningSession(anyhow::Error),
    RemoteSession(anyhow::Error),
}

#[derive(Debug)]
pub enum OpenRemoteEditorError {
    RelayNotConfigured,
    Authentication(anyhow::Error),
    ResolveEditorPath(anyhow::Error),
    SigningSession(anyhow::Error),
    RemoteSession(anyhow::Error),
    CreateTunnel(anyhow::Error),
    LaunchEditor(anyhow::Error),
}

#[derive(Debug)]
pub enum RelayPairingClientError {
    NotConfigured,
    Authentication(anyhow::Error),
    Pairing(anyhow::Error),
    Store(anyhow::Error),
}

#[derive(Debug)]
enum HostRelayResolveError {
    RelayNotConfigured,
    Authentication(anyhow::Error),
    RemoteSession(anyhow::Error),
    SigningSession(anyhow::Error),
}

#[derive(Debug, Clone)]
struct RelayTunnelAccess {
    relay_url: String,
    signing_key: SigningKey,
    signing_session_id: String,
    server_verify_key: VerifyingKey,
}

#[derive(Debug, Clone, Deserialize)]
struct RelayEditorPathResponse {
    workspace_path: String,
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
        let relay_signing = self.runtime.relay_signing.clone();
        let access_token = remote_client
            .access_token()
            .await
            .context("Failed to get access token for relay auth code")
            .map_err(RelayPairingClientError::Authentication)?;
        let relay_client = RelayApiClient::new(relay_base_url, access_token);
        let relay_client::PairRelayHostResult {
            signing_session_id,
            client_id,
            server_public_key_b64,
        } = relay_client
            .pair_host(req, relay_signing.signing_key())
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
            .await
            .map_err(RelayPairingClientError::Store)?;
        self.sessions
            .cache_signing_session_id(req.host_id, signing_session_id.to_string())
            .await;
        Ok(())
    }

    pub async fn list_hosts(&self) -> Vec<RelayPairedHost> {
        let mut hosts = self.repository.list_hosts().await;
        hosts.sort_by(|a, b| b.paired_at.cmp(&a.paired_at));
        hosts
    }

    pub async fn remove_host(&self, host_id: Uuid) -> Result<bool, RelayPairingClientError> {
        let removed = self
            .repository
            .remove_credentials(host_id)
            .await
            .map_err(RelayPairingClientError::Store)?;
        if removed {
            self.sessions.clear(host_id).await;
        }
        Ok(removed)
    }
}

impl RelayHost {
    async fn open_transport(&self) -> Result<RelayHostTransport, HostRelayResolveError> {
        let remote_client = self.runtime.remote_client.clone();
        let relay_base_url = self
            .runtime
            .remote_info
            .get_relay_api_base()
            .ok_or(HostRelayResolveError::RelayNotConfigured)?;
        let signing_key = self.runtime.relay_signing.signing_key().clone();
        let access_token = remote_client
            .access_token()
            .await
            .map_err(anyhow::Error::from)
            .map_err(HostRelayResolveError::Authentication)?;
        let cached_auth_state = self.sessions.load_auth_state(self.identity.host_id).await;
        let transport = RelayHostTransport::bootstrap(
            RelayApiClient::new(relay_base_url, access_token),
            self.identity.clone(),
            signing_key,
            cached_auth_state
                .as_ref()
                .map(|value| value.remote_session.clone()),
            cached_auth_state.map(|value| value.signing_session_id),
        )
        .await
        .map_err(map_bootstrap_error)?;

        Ok(transport)
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
    ) -> Result<ProxiedResponse, HostRelayProxyError> {
        // Try direct WebRTC data channel first.
        if let Some(response) = self
            .try_webrtc_proxy(method, target_path, headers, body)
            .await
        {
            return Ok(ProxiedResponse::Direct(response));
        }

        // Fall back to relay.
        let mut transport = self
            .open_transport()
            .await
            .map_err(HostRelayProxyError::from)?;
        let response = transport
            .send_http(method, target_path, headers, body)
            .await
            .map_err(HostRelayProxyError::from);
        self.persist_auth_state(&transport).await;

        // Kick off background WebRTC handshake for future requests,
        // reusing the already-authenticated transport.
        self.maybe_start_webrtc(transport).await;

        response.map(ProxiedResponse::Relay)
    }

    /// Try to proxy through an active WebRTC data channel. Returns `None`
    /// if there's no active connection or the request fails.
    async fn try_webrtc_proxy(
        &self,
        method: &Method,
        target_path: &str,
        headers: &HeaderMap,
        body: &[u8],
    ) -> Option<DirectProxyResponse> {
        let client = self.webrtc.get(self.identity.host_id).await?;
        if !client.is_connected() {
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
                    base64::engine::general_purpose::STANDARD
                        .decode(body_b64)
                        .unwrap_or_default()
                } else {
                    Vec::new()
                };

                Some(DirectProxyResponse {
                    status: response.status,
                    headers: response.headers,
                    body,
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
                Ok(client) => {
                    webrtc.insert(host_id, Arc::new(client)).await;
                    tracing::debug!(%host_id, "WebRTC direct connection established");
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
    ) -> Result<ProxiedWsConnection, HostRelayProxyError> {
        // Try direct WebRTC data channel first.
        if let Some(conn) = self.try_webrtc_ws(target_path, protocols).await {
            return Ok(conn);
        }

        // Fall back to relay.
        let mut transport = self
            .open_transport()
            .await
            .map_err(HostRelayProxyError::from)?;
        let connection = transport
            .connect_ws(target_path, protocols)
            .await
            .map_err(HostRelayProxyError::from);
        self.persist_auth_state(&transport).await;
        let (upstream_socket, selected_protocol) = connection?;

        // Kick off WebRTC handshake for future requests.
        self.maybe_start_webrtc(transport).await;

        let (sender, receiver) = upstream_socket.split();
        Ok(ProxiedWsConnection {
            selected_protocol,
            sender: Box::new(sender),
            receiver: Box::new(receiver),
        })
    }

    /// Try to open a WebSocket through an active WebRTC data channel.
    async fn try_webrtc_ws(
        &self,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Option<ProxiedWsConnection> {
        let client = self.webrtc.get(self.identity.host_id).await?;
        if !client.is_connected() {
            return None;
        }

        match client.open_ws(target_path, protocols).await {
            Ok(ws_connection) => {
                let selected_protocol = ws_connection.selected_protocol.clone();
                let (sender, receiver) = ws_connection.into_upstream();
                Some(ProxiedWsConnection {
                    selected_protocol,
                    sender: Box::new(sender),
                    receiver: Box::new(receiver),
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

    pub async fn open_workspace_in_editor(
        &self,
        tunnel_manager: &TunnelManager,
        workspace_id: Uuid,
        editor_type: Option<&str>,
        file_path: Option<&str>,
    ) -> Result<OpenRemoteEditorResponse, OpenRemoteEditorError> {
        let mut transport = self
            .open_transport()
            .await
            .map_err(OpenRemoteEditorError::from)?;
        let editor_path_api_path = build_workspace_editor_path_api_path(workspace_id, file_path);
        let editor_path = transport
            .get_signed_json::<RelayEditorPathResponse>(&editor_path_api_path)
            .await
            .map_err(OpenRemoteEditorError::from);
        self.persist_auth_state(&transport).await;
        let editor_path = editor_path?;
        let tunnel_access = relay_tunnel_access(&transport);
        let local_port = tunnel_manager
            .get_or_create_ssh_tunnel(
                self.identity.host_id,
                &tunnel_access.relay_url,
                &tunnel_access.signing_key,
                &tunnel_access.signing_session_id,
                tunnel_access.server_verify_key,
            )
            .await
            .map_err(OpenRemoteEditorError::CreateTunnel)?;

        desktop_bridge::service::open_remote_editor(
            local_port,
            &tunnel_access.signing_key,
            &self.identity.host_id.to_string(),
            &editor_path.workspace_path,
            editor_type,
        )
        .map_err(OpenRemoteEditorError::LaunchEditor)
    }
}

impl From<HostRelayResolveError> for HostRelayProxyError {
    fn from(value: HostRelayResolveError) -> Self {
        match value {
            HostRelayResolveError::RelayNotConfigured => Self::RelayNotConfigured,
            HostRelayResolveError::Authentication(error) => Self::Authentication(error),
            HostRelayResolveError::RemoteSession(error) => Self::RemoteSession(error),
            HostRelayResolveError::SigningSession(error) => Self::SigningSession(error),
        }
    }
}

impl From<RelayTransportError> for HostRelayProxyError {
    fn from(value: RelayTransportError) -> Self {
        match value {
            RelayTransportError::Upstream(error) => Self::Upstream(error),
            RelayTransportError::SigningSession(error) => Self::SigningSession(error),
            RelayTransportError::RemoteSession(error) => Self::RemoteSession(error),
        }
    }
}

impl From<HostRelayResolveError> for OpenRemoteEditorError {
    fn from(value: HostRelayResolveError) -> Self {
        match value {
            HostRelayResolveError::RelayNotConfigured => Self::RelayNotConfigured,
            HostRelayResolveError::Authentication(error) => Self::Authentication(error),
            HostRelayResolveError::RemoteSession(error) => Self::RemoteSession(error),
            HostRelayResolveError::SigningSession(error) => Self::SigningSession(error),
        }
    }
}

impl From<RelayTransportError> for OpenRemoteEditorError {
    fn from(value: RelayTransportError) -> Self {
        match value {
            RelayTransportError::Upstream(error) => Self::ResolveEditorPath(error),
            RelayTransportError::SigningSession(error) => Self::SigningSession(error),
            RelayTransportError::RemoteSession(error) => Self::RemoteSession(error),
        }
    }
}

/// Negotiate a WebRTC data channel with the remote host via the relay.
///
/// Reuses an already-authenticated transport from the caller so no extra
/// relay sessions are created and no shared session cache is touched.
async fn negotiate_webrtc(mut transport: RelayHostTransport) -> anyhow::Result<WebRtcClient> {
    let session_id = Uuid::new_v4().to_string();
    let webrtc_offer = WebRtcClient::create_offer(session_id)?;

    let offer_json = serde_json::to_vec(&webrtc_offer.offer)?;
    let mut headers = HeaderMap::new();
    headers.insert("content-type", "application/json".parse().unwrap());

    let response = transport
        .send_http(&Method::POST, "/api/webrtc/offer", &headers, &offer_json)
        .await
        .map_err(|e| anyhow::anyhow!("WebRTC offer request failed: {e:?}"))?;

    if !response.status().is_success() {
        anyhow::bail!("WebRTC offer rejected with status {}", response.status());
    }

    let answer: relay_webrtc::SdpAnswer = response
        .json()
        .await
        .map_err(|e| anyhow::anyhow!("Invalid WebRTC answer response: {e}"))?;

    let shutdown = CancellationToken::new();
    WebRtcClient::connect(
        webrtc_offer.rtc,
        webrtc_offer.pending,
        &answer.sdp,
        shutdown,
    )
    .await
}

fn relay_tunnel_access(transport: &RelayHostTransport) -> RelayTunnelAccess {
    RelayTunnelAccess {
        relay_url: transport.relay_url(),
        signing_key: transport.signing_key().clone(),
        signing_session_id: transport.auth_state().signing_session_id.clone(),
        server_verify_key: *transport.server_verify_key(),
    }
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

fn map_bootstrap_error(error: RelayTransportBootstrapError) -> HostRelayResolveError {
    match error {
        RelayTransportBootstrapError::RemoteSession(error) => {
            HostRelayResolveError::RemoteSession(error)
        }
        RelayTransportBootstrapError::SigningSession(error) => {
            HostRelayResolveError::SigningSession(error)
        }
    }
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
) -> anyhow::Result<()> {
    let path = relay_host_credentials_path();
    let json = serde_json::to_string_pretty(map)?;
    tokio::fs::write(&path, json).await?;
    Ok(())
}
