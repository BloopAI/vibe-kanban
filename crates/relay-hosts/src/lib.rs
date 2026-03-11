use std::{collections::HashMap, sync::Arc};

use anyhow::Context as _;
use chrono::Utc;
use desktop_bridge::{service::OpenRemoteEditorResponse, tunnel::TunnelManager};
use ed25519_dalek::{SigningKey, VerifyingKey};
use http::{HeaderMap, Method};
use relay_client::{
    RelayApiClient, RelayHostIdentity, RelayHostTransport, RelayTransportBootstrapError,
    RelayTransportError, SignedUpstreamSocket,
};
use relay_control::signing::RelaySigningService;
use relay_types::{PairRelayHostRequest, RelayAuthState, RelayPairedHost, RemoteSession};
use serde::{Deserialize, Serialize};
use services::services::remote_client::RemoteClient;
use tokio::sync::RwLock;
use trusted_key_auth::trusted_keys::parse_public_key_base64;
use utils::assets::relay_host_credentials_path;
use uuid::Uuid;

#[derive(Debug, Clone, Default)]
struct RelaySessionCacheEntry {
    remote_session_id: Option<Uuid>,
    signing_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayHostCredentials {
    pub host_name: Option<String>,
    pub paired_at: Option<String>,
    pub client_id: Option<String>,
    pub server_public_key_b64: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RelayHostCredentialSummary {
    pub host_id: Uuid,
    pub host_name: Option<String>,
    pub paired_at: Option<String>,
}

#[derive(Clone)]
pub struct RelayHostStore {
    credentials: Arc<RwLock<HashMap<Uuid, RelayHostCredentials>>>,
    auth_state: Arc<RwLock<HashMap<Uuid, RelaySessionCacheEntry>>>,
}

impl RelayHostStore {
    pub async fn load() -> Self {
        Self {
            credentials: Arc::new(RwLock::new(load_relay_host_credentials_map().await)),
            auth_state: Arc::new(RwLock::new(HashMap::new())),
        }
    }

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

    pub async fn clear_auth_state(&self, host_id: Uuid) {
        self.auth_state.write().await.remove(&host_id);
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

    pub async fn get_credentials(&self, host_id: Uuid) -> Option<RelayHostCredentials> {
        self.credentials.read().await.get(&host_id).cloned()
    }

    pub async fn list_credentials_summary(&self) -> Vec<RelayHostCredentialSummary> {
        self.credentials
            .read()
            .await
            .iter()
            .map(|(host_id, value)| RelayHostCredentialSummary {
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
            self.auth_state.write().await.remove(&host_id);
            persist_relay_host_credentials_map(&credentials).await?;
        }

        Ok(removed)
    }
}

#[derive(Clone)]
pub struct RelayHosts {
    store: RelayHostStore,
    runtime: Option<RelayHostsRuntime>,
}

#[derive(Clone)]
struct RelayHostsRuntime {
    remote_client: RemoteClient,
    relay_base_url: String,
    relay_signing: RelaySigningService,
    tunnel_manager: Arc<TunnelManager>,
}

#[derive(Clone)]
pub struct RelayHost {
    relay_hosts: RelayHosts,
    host_id: Uuid,
}

pub struct HostRelayWsConnection {
    pub upstream_socket: SignedUpstreamSocket,
    pub selected_protocol: Option<String>,
}

#[derive(Debug)]
pub enum HostRelayProxyError {
    NotPaired,
    MissingClientMetadata,
    MissingSigningMetadata,
    RelayNotConfigured,
    Authentication(anyhow::Error),
    Upstream(anyhow::Error),
    SigningSession(anyhow::Error),
    RemoteSession(anyhow::Error),
}

#[derive(Debug)]
pub enum OpenRemoteEditorError {
    NotPaired,
    MissingClientMetadata,
    MissingSigningMetadata,
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
    NotPaired,
    MissingClientMetadata,
    MissingSigningMetadata,
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
    pub fn new(store: RelayHostStore) -> Self {
        Self {
            store,
            runtime: None,
        }
    }

    pub fn with_runtime(
        mut self,
        remote_client: RemoteClient,
        relay_base_url: String,
        relay_signing: RelaySigningService,
        tunnel_manager: Arc<TunnelManager>,
    ) -> Self {
        self.runtime = Some(RelayHostsRuntime {
            remote_client,
            relay_base_url,
            relay_signing,
            tunnel_manager,
        });
        self
    }

    pub fn host(&self, host_id: Uuid) -> RelayHost {
        RelayHost {
            relay_hosts: self.clone(),
            host_id,
        }
    }

    pub async fn pair_host(
        &self,
        req: &PairRelayHostRequest,
    ) -> Result<(), RelayPairingClientError> {
        let runtime = self
            .runtime
            .as_ref()
            .ok_or(RelayPairingClientError::NotConfigured)?;
        let remote_client = runtime.remote_client.clone();
        let relay_base_url = runtime.relay_base_url.clone();
        let relay_signing = runtime.relay_signing.clone();
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

        self.store
            .upsert_credentials(
                req.host_id,
                Some(req.host_name.clone()),
                Some(Utc::now().to_rfc3339()),
                Some(client_id.to_string()),
                Some(server_public_key_b64),
            )
            .await
            .map_err(RelayPairingClientError::Store)?;
        self.store
            .cache_signing_session_id(req.host_id, signing_session_id.to_string())
            .await;
        Ok(())
    }

    pub async fn list_hosts(&self) -> Vec<RelayPairedHost> {
        let mut hosts = self
            .store
            .list_credentials_summary()
            .await
            .into_iter()
            .map(|value| RelayPairedHost {
                host_id: value.host_id,
                host_name: value.host_name,
                paired_at: value.paired_at,
            })
            .collect::<Vec<_>>();

        hosts.sort_by(|a, b| b.paired_at.cmp(&a.paired_at));
        hosts
    }

    pub async fn remove_host(&self, host_id: Uuid) -> Result<bool, RelayPairingClientError> {
        self.store
            .remove_credentials(host_id)
            .await
            .map_err(RelayPairingClientError::Store)
    }

    async fn open_transport(
        &self,
        host_id: Uuid,
    ) -> Result<(RelayHostStore, RelayHostTransport), HostRelayResolveError> {
        let runtime = self
            .runtime
            .as_ref()
            .ok_or(HostRelayResolveError::RelayNotConfigured)?;
        let store = self.store.clone();
        let remote_client = runtime.remote_client.clone();
        let relay_base_url = runtime.relay_base_url.clone();
        let signing_key = runtime.relay_signing.signing_key().clone();
        let identity = load_paired_relay_host_identity(&store, host_id).await?;
        let access_token = remote_client
            .access_token()
            .await
            .map_err(anyhow::Error::from)
            .map_err(HostRelayResolveError::Authentication)?;
        let cached_auth_state = store.load_auth_state(host_id).await;
        let transport = RelayHostTransport::bootstrap(
            RelayApiClient::new(relay_base_url, access_token),
            identity,
            signing_key,
            cached_auth_state
                .as_ref()
                .map(|value| value.remote_session.clone()),
            cached_auth_state.map(|value| value.signing_session_id),
        )
        .await
        .map_err(map_bootstrap_error)?;

        Ok((store, transport))
    }

    async fn persist_auth_state(
        &self,
        store: &RelayHostStore,
        host_id: Uuid,
        transport: &RelayHostTransport,
    ) {
        store
            .cache_auth_state(host_id, transport.auth_state())
            .await;
    }
}

impl RelayHost {
    pub async fn proxy_http(
        &self,
        method: &Method,
        target_path: &str,
        headers: &HeaderMap,
        body: &[u8],
    ) -> Result<reqwest::Response, HostRelayProxyError> {
        let (store, mut transport) = self
            .relay_hosts
            .open_transport(self.host_id)
            .await
            .map_err(HostRelayProxyError::from)?;
        let response = transport
            .send_http(method, target_path, headers, body)
            .await
            .map_err(HostRelayProxyError::from);
        self.relay_hosts
            .persist_auth_state(&store, self.host_id, &transport)
            .await;
        response
    }

    pub async fn proxy_ws(
        &self,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Result<HostRelayWsConnection, HostRelayProxyError> {
        let (store, mut transport) = self
            .relay_hosts
            .open_transport(self.host_id)
            .await
            .map_err(HostRelayProxyError::from)?;
        let connection = transport
            .connect_ws(target_path, protocols)
            .await
            .map_err(HostRelayProxyError::from);
        self.relay_hosts
            .persist_auth_state(&store, self.host_id, &transport)
            .await;
        let (upstream_socket, selected_protocol) = connection?;

        Ok(HostRelayWsConnection {
            upstream_socket,
            selected_protocol,
        })
    }

    pub async fn open_workspace_in_editor(
        &self,
        workspace_id: Uuid,
        editor_type: Option<&str>,
        file_path: Option<&str>,
    ) -> Result<OpenRemoteEditorResponse, OpenRemoteEditorError> {
        let tunnel_manager = self
            .relay_hosts
            .runtime
            .as_ref()
            .ok_or(OpenRemoteEditorError::RelayNotConfigured)?
            .tunnel_manager
            .clone();
        let (store, mut transport) = self
            .relay_hosts
            .open_transport(self.host_id)
            .await
            .map_err(OpenRemoteEditorError::from)?;
        let editor_path_api_path = build_workspace_editor_path_api_path(workspace_id, file_path);
        let editor_path = transport
            .get_signed_json::<RelayEditorPathResponse>(&editor_path_api_path)
            .await
            .map_err(OpenRemoteEditorError::from);
        self.relay_hosts
            .persist_auth_state(&store, self.host_id, &transport)
            .await;
        let editor_path = editor_path?;
        let tunnel_access = relay_tunnel_access(&transport);
        let local_port = tunnel_manager
            .get_or_create_ssh_tunnel(
                self.host_id,
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
            &self.host_id.to_string(),
            &editor_path.workspace_path,
            editor_type,
        )
        .map_err(OpenRemoteEditorError::LaunchEditor)
    }
}

impl From<HostRelayResolveError> for HostRelayProxyError {
    fn from(value: HostRelayResolveError) -> Self {
        match value {
            HostRelayResolveError::NotPaired => Self::NotPaired,
            HostRelayResolveError::MissingClientMetadata => Self::MissingClientMetadata,
            HostRelayResolveError::MissingSigningMetadata => Self::MissingSigningMetadata,
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
            HostRelayResolveError::NotPaired => Self::NotPaired,
            HostRelayResolveError::MissingClientMetadata => Self::MissingClientMetadata,
            HostRelayResolveError::MissingSigningMetadata => Self::MissingSigningMetadata,
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

fn relay_tunnel_access(transport: &RelayHostTransport) -> RelayTunnelAccess {
    RelayTunnelAccess {
        relay_url: transport.relay_url(),
        signing_key: transport.signing_key().clone(),
        signing_session_id: transport.auth_state().signing_session_id.clone(),
        server_verify_key: *transport.server_verify_key(),
    }
}

async fn load_paired_relay_host_identity(
    store: &RelayHostStore,
    host_id: Uuid,
) -> Result<RelayHostIdentity, HostRelayResolveError> {
    let credentials = store
        .get_credentials(host_id)
        .await
        .ok_or(HostRelayResolveError::NotPaired)?;

    let client_id = credentials
        .client_id
        .as_ref()
        .and_then(|value| value.parse::<Uuid>().ok())
        .ok_or(HostRelayResolveError::MissingClientMetadata)?;
    let server_verify_key = credentials
        .server_public_key_b64
        .as_deref()
        .and_then(|key| parse_public_key_base64(key).ok())
        .ok_or(HostRelayResolveError::MissingSigningMetadata)?;

    Ok(RelayHostIdentity {
        host_id,
        client_id,
        server_verify_key,
    })
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
