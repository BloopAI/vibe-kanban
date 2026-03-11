use axum::extract::FromRef;
use deployment::Deployment;
use desktop_bridge::service::OpenRemoteEditorResponse;
use ed25519_dalek::{SigningKey, VerifyingKey};
use http::{HeaderMap, Method};
use local_deployment::relay_host_store::RelayHostStore;
use relay_client::{
    RelayApiClient, RelayHostIdentity, RelayHostTransport, RelayTransportBootstrapError,
    RelayTransportError, SignedUpstreamSocket,
};
use serde::Deserialize;
use services::services::remote_client::RemoteClient;
use trusted_key_auth::trusted_keys::parse_public_key_base64;
use uuid::Uuid;

use crate::DeploymentImpl;

#[derive(Clone)]
pub struct HostRelayService {
    deployment: DeploymentImpl,
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

impl FromRef<DeploymentImpl> for HostRelayService {
    fn from_ref(deployment: &DeploymentImpl) -> Self {
        Self::new(deployment.clone())
    }
}

impl HostRelayService {
    pub fn new(deployment: DeploymentImpl) -> Self {
        Self { deployment }
    }

    pub async fn proxy_http(
        &self,
        host_id: Uuid,
        method: &Method,
        target_path: &str,
        headers: &HeaderMap,
        body: &[u8],
    ) -> Result<reqwest::Response, HostRelayProxyError> {
        let (store, mut transport) = self
            .open_transport(host_id)
            .await
            .map_err(HostRelayProxyError::from)?;
        let response = transport
            .send_http(method, target_path, headers, body)
            .await
            .map_err(HostRelayProxyError::from);
        self.persist_auth_state(&store, host_id, &transport).await;
        response
    }

    pub async fn proxy_ws(
        &self,
        host_id: Uuid,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Result<HostRelayWsConnection, HostRelayProxyError> {
        let (store, mut transport) = self
            .open_transport(host_id)
            .await
            .map_err(HostRelayProxyError::from)?;
        let connection = transport
            .connect_ws(target_path, protocols)
            .await
            .map_err(HostRelayProxyError::from);
        self.persist_auth_state(&store, host_id, &transport).await;
        let (upstream_socket, selected_protocol) = connection?;

        Ok(HostRelayWsConnection {
            upstream_socket,
            selected_protocol,
        })
    }

    pub async fn open_workspace_in_editor(
        &self,
        host_id: Uuid,
        workspace_id: Uuid,
        editor_type: Option<&str>,
        file_path: Option<&str>,
    ) -> Result<OpenRemoteEditorResponse, OpenRemoteEditorError> {
        let (store, mut transport) = self
            .open_transport(host_id)
            .await
            .map_err(OpenRemoteEditorError::from)?;
        let editor_path_api_path = build_workspace_editor_path_api_path(workspace_id, file_path);
        let editor_path = transport
            .get_signed_json::<RelayEditorPathResponse>(&editor_path_api_path)
            .await
            .map_err(OpenRemoteEditorError::from);
        self.persist_auth_state(&store, host_id, &transport).await;
        let editor_path = editor_path?;
        let tunnel_access = relay_tunnel_access(&transport);
        let local_port = self
            .deployment
            .tunnel_manager()
            .get_or_create_ssh_tunnel(
                host_id,
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
            &host_id.to_string(),
            &editor_path.workspace_path,
            editor_type,
        )
        .map_err(OpenRemoteEditorError::LaunchEditor)
    }

    async fn resolve_host(
        &self,
    ) -> Result<(RelayHostStore, RemoteClient, String, SigningKey), HostRelayResolveError> {
        let store = self.deployment.relay_host_store();
        let remote_client = self
            .deployment
            .remote_client()
            .map_err(|_| HostRelayResolveError::RelayNotConfigured)?;
        let relay_base_url = Deployment::shared_relay_api_base(&self.deployment)
            .ok_or(HostRelayResolveError::RelayNotConfigured)?;

        Ok((
            store,
            remote_client,
            relay_base_url,
            self.deployment.relay_signing().signing_key().clone(),
        ))
    }

    async fn open_transport(
        &self,
        host_id: Uuid,
    ) -> Result<(RelayHostStore, RelayHostTransport), HostRelayResolveError> {
        let (store, remote_client, relay_base_url, signing_key) = self.resolve_host().await?;
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
