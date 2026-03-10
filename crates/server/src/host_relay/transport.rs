use ed25519_dalek::{SigningKey, VerifyingKey};
use http::{HeaderMap, Method};
use local_deployment::relay_host_store::RelayHostStore;
use relay_client::{
    RelayApiClient, RelayHostIdentity, RelayHostTransport, RelayTransportBootstrapError,
    RelayTransportError, SignedUpstreamSocket,
};
use serde::de::DeserializeOwned;
use services::services::remote_client::RemoteClient;
use trusted_key_auth::trusted_keys::parse_public_key_base64;
use uuid::Uuid;

#[derive(Debug)]
pub enum HostRelayResolveError {
    NotPaired,
    MissingClientMetadata,
    MissingSigningMetadata,
    RelayNotConfigured,
    Authentication(anyhow::Error),
    RemoteSession(anyhow::Error),
    SigningSession(anyhow::Error),
}

#[derive(Debug)]
pub enum HostRelayOperationError {
    Upstream(anyhow::Error),
    SigningSession(anyhow::Error),
    RemoteSession(anyhow::Error),
}

#[derive(Debug, Clone)]
pub struct RelayTunnelAccess {
    pub relay_url: String,
    pub signing_key: SigningKey,
    pub signing_session_id: String,
    pub server_verify_key: VerifyingKey,
}

pub struct ResolvedHostRelay {
    store: RelayHostStore,
    host_id: Uuid,
    transport: RelayHostTransport,
}

impl ResolvedHostRelay {
    pub async fn open(
        host_id: Uuid,
        store: RelayHostStore,
        remote_client: RemoteClient,
        relay_base_url: String,
        signing_key: SigningKey,
    ) -> Result<Self, HostRelayResolveError> {
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

        Ok(Self {
            store,
            host_id,
            transport,
        })
    }

    pub async fn send_http(
        &mut self,
        method: &Method,
        target_path: &str,
        headers: &HeaderMap,
        body: &[u8],
    ) -> Result<reqwest::Response, HostRelayOperationError> {
        let response = self
            .transport
            .send_http(method, target_path, headers, body)
            .await
            .map_err(HostRelayOperationError::from);
        self.persist_auth_state().await;
        response
    }

    pub async fn connect_ws(
        &mut self,
        target_path: &str,
        protocols: Option<&str>,
    ) -> Result<(SignedUpstreamSocket, Option<String>), HostRelayOperationError> {
        let response = self
            .transport
            .connect_ws(target_path, protocols)
            .await
            .map_err(HostRelayOperationError::from);
        self.persist_auth_state().await;
        response
    }

    pub async fn get_json<TData>(&mut self, path: &str) -> Result<TData, HostRelayOperationError>
    where
        TData: DeserializeOwned,
    {
        let response = self
            .transport
            .get_signed_json(path)
            .await
            .map_err(HostRelayOperationError::from);
        self.persist_auth_state().await;
        response
    }

    pub fn tunnel_access(&self) -> RelayTunnelAccess {
        RelayTunnelAccess {
            relay_url: self.transport.relay_url(),
            signing_key: self.transport.signing_key().clone(),
            signing_session_id: self.transport.auth_state().signing_session_id.clone(),
            server_verify_key: *self.transport.server_verify_key(),
        }
    }

    async fn persist_auth_state(&self) {
        self.store
            .cache_auth_state(self.host_id, self.transport.auth_state())
            .await;
    }
}

impl From<RelayTransportError> for HostRelayOperationError {
    fn from(value: RelayTransportError) -> Self {
        match value {
            RelayTransportError::Upstream(error) => Self::Upstream(error),
            RelayTransportError::SigningSession(error) => Self::SigningSession(error),
            RelayTransportError::RemoteSession(error) => Self::RemoteSession(error),
        }
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
