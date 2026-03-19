use std::{collections::HashMap, sync::Arc};

use chrono::Utc;
use desktop_bridge::{
    DesktopBridgeError, service::OpenRemoteEditorResponse, tunnel::TunnelManager,
};
use http::{HeaderMap, Method};
pub use relay_client::RelayApiError;
use relay_client::{RelayApiClient, RelayHostIdentity, RelayHostTransport};
use relay_control::signing::RelaySigningService;
use relay_types::{PairRelayHostRequest, RelayAuthState, RelayPairedHost, RemoteSession};
use relay_ws::SignedTungsteniteSocket;
use remote_info::RemoteInfo;
use serde::{Deserialize, Serialize};
use services::services::remote_client::{RemoteClient, RemoteClientError};
use tokio::sync::RwLock;
use trusted_key_auth::trusted_keys::parse_public_key_base64;
use utils::assets::relay_host_credentials_path;
use uuid::Uuid;

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

#[derive(Clone)]
pub struct RelayHosts {
    repository: RelayHostRepository,
    sessions: RelaySessionCache,
    runtime: RelayRuntime,
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
}

pub struct HostRelayWsConnection {
    pub upstream_socket: SignedTungsteniteSocket,
    pub selected_protocol: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum OpenRemoteEditorError {
    #[error(transparent)]
    Connection(#[from] RelayConnectionError),
    #[error("Failed to create SSH tunnel: {0}")]
    CreateTunnel(std::io::Error),
    #[error("Failed to set up SSH for remote editor: {0}")]
    SshSetup(DesktopBridgeError),
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

#[derive(Debug, Clone)]
struct RelayTunnelAccess {
    relay_url: String,
    signing_session_id: Uuid,
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
        }
    }

    pub async fn host(&self, host_id: Uuid) -> Result<RelayHost, RelayHostLookupError> {
        let identity = self.repository.load_identity(host_id).await?;
        Ok(RelayHost {
            identity,
            sessions: self.sessions.clone(),
            runtime: self.runtime.clone(),
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
        }
        Ok(removed)
    }
}

impl RelayHost {
    async fn open_transport(&self) -> Result<RelayHostTransport, RelayConnectionError> {
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
    ) -> Result<reqwest::Response, RelayConnectionError> {
        let mut transport = self.open_transport().await?;
        let response = transport
            .send_http(method, target_path, headers, body)
            .await;
        self.persist_auth_state(&transport).await;
        Ok(response?)
    }

    pub async fn proxy_ws(
        &self,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Result<HostRelayWsConnection, RelayConnectionError> {
        let mut transport = self.open_transport().await?;
        let connection = transport.connect_ws(target_path, protocols).await;
        self.persist_auth_state(&transport).await;
        let (upstream_socket, selected_protocol) = connection?;

        Ok(HostRelayWsConnection {
            upstream_socket,
            selected_protocol,
        })
    }

    pub async fn open_workspace_in_editor(
        &self,
        tunnel_manager: &TunnelManager,
        workspace_id: Uuid,
        editor_type: Option<&str>,
        file_path: Option<&str>,
    ) -> Result<OpenRemoteEditorResponse, OpenRemoteEditorError> {
        let mut transport = self.open_transport().await?;
        let editor_path_api_path = build_workspace_editor_path_api_path(workspace_id, file_path);
        let editor_path = transport
            .get_signed_json::<RelayEditorPathResponse>(&editor_path_api_path)
            .await;
        self.persist_auth_state(&transport).await;
        let editor_path = editor_path?;
        let tunnel_access = relay_tunnel_access(&transport);
        let local_port = tunnel_manager
            .get_or_create_ssh_tunnel(
                self.identity.host_id,
                &tunnel_access.relay_url,
                tunnel_access.signing_session_id,
            )
            .await
            .map_err(OpenRemoteEditorError::CreateTunnel)?;

        desktop_bridge::service::open_remote_editor(
            local_port,
            &self.runtime.relay_signing,
            &self.identity.host_id.to_string(),
            &editor_path.workspace_path,
            editor_type,
        )
        .map_err(OpenRemoteEditorError::SshSetup)
    }
}

fn relay_tunnel_access(transport: &RelayHostTransport) -> RelayTunnelAccess {
    RelayTunnelAccess {
        relay_url: transport.relay_url(),
        signing_session_id: transport.auth_state().signing_session_id,
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
