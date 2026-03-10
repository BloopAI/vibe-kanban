use deployment::Deployment;
use ed25519_dalek::{SigningKey, VerifyingKey};
use relay_client::RelayApiClient;
use relay_types::RemoteSession;
use trusted_key_auth::trusted_keys::parse_public_key_base64;
use uuid::Uuid;

use crate::DeploymentImpl;

#[derive(Debug)]
pub enum RelayClientBuildError {
    NotConfigured,
    Authentication(anyhow::Error),
}

#[derive(Debug)]
pub enum RelayHostSessionInitError {
    RemoteSession(anyhow::Error),
    SigningSession(anyhow::Error),
}

#[derive(Debug, Clone)]
pub struct PairedRelayHostMetadata {
    pub client_id: Uuid,
    pub server_verify_key: VerifyingKey,
}

#[derive(Debug, Clone, Copy)]
pub enum PairedRelayHostMetadataError {
    NotPaired,
    MissingClientMetadata,
    MissingSigningMetadata,
}

pub async fn build_relay_client(
    deployment: &DeploymentImpl,
) -> Result<RelayApiClient, RelayClientBuildError> {
    let remote_client = deployment
        .remote_client()
        .map_err(|_| RelayClientBuildError::NotConfigured)?;
    let access_token = remote_client
        .access_token()
        .await
        .map_err(anyhow::Error::from)
        .map_err(RelayClientBuildError::Authentication)?;
    let relay_base_url = deployment
        .shared_api_base()
        .ok_or(RelayClientBuildError::NotConfigured)?;

    Ok(RelayApiClient::new(relay_base_url, access_token))
}

pub async fn load_paired_relay_host_metadata(
    deployment: &DeploymentImpl,
    host_id: Uuid,
) -> Result<PairedRelayHostMetadata, PairedRelayHostMetadataError> {
    let credentials = deployment
        .get_relay_host_credentials(host_id)
        .await
        .ok_or(PairedRelayHostMetadataError::NotPaired)?;

    let client_id = credentials
        .client_id
        .as_ref()
        .and_then(|value| value.parse::<Uuid>().ok())
        .ok_or(PairedRelayHostMetadataError::MissingClientMetadata)?;
    let server_verify_key = credentials
        .server_public_key_b64
        .as_deref()
        .and_then(|key| parse_public_key_base64(key).ok())
        .ok_or(PairedRelayHostMetadataError::MissingSigningMetadata)?;

    Ok(PairedRelayHostMetadata {
        client_id,
        server_verify_key,
    })
}

pub struct RelayHostSession {
    deployment: DeploymentImpl,
    host_id: Uuid,
    client_id: Uuid,
    relay_client: RelayApiClient,
    signing_key: SigningKey,
    remote_session: RemoteSession,
    signing_session_id: String,
}

impl RelayHostSession {
    pub async fn for_host(
        deployment: &DeploymentImpl,
        relay_client: RelayApiClient,
        host_id: Uuid,
        client_id: Uuid,
        signing_key: SigningKey,
    ) -> Result<Self, RelayHostSessionInitError> {
        let remote_session =
            get_or_create_cached_remote_session(deployment, &relay_client, host_id)
                .await
                .map_err(RelayHostSessionInitError::RemoteSession)?;
        let signing_session_id = get_or_create_cached_signing_session(
            deployment,
            &relay_client,
            &remote_session,
            host_id,
            client_id,
            &signing_key,
        )
        .await
        .map_err(RelayHostSessionInitError::SigningSession)?;

        Ok(Self {
            deployment: deployment.clone(),
            host_id,
            client_id,
            relay_client,
            signing_key,
            remote_session,
            signing_session_id,
        })
    }

    pub fn host_id(&self) -> Uuid {
        self.host_id
    }

    pub fn relay_base_url(&self) -> &str {
        self.relay_client.base_url()
    }

    pub fn remote_session(&self) -> &RemoteSession {
        &self.remote_session
    }

    pub fn signing_key(&self) -> &SigningKey {
        &self.signing_key
    }

    pub fn signing_session_id(&self) -> &str {
        &self.signing_session_id
    }

    pub async fn refresh_signing_session(&mut self) -> anyhow::Result<()> {
        let refreshed = self
            .relay_client
            .refresh_signing_session(&self.remote_session, &self.signing_key, self.client_id)
            .await?;
        let signing_session_id = refreshed.signing_session_id.to_string();
        self.deployment
            .cache_relay_signing_session_id(self.host_id, signing_session_id.clone())
            .await;
        self.signing_session_id = signing_session_id;
        Ok(())
    }

    pub async fn rotate_remote_session(&mut self) -> anyhow::Result<()> {
        self.deployment
            .invalidate_cached_relay_remote_session_id(self.host_id)
            .await;

        let remote_session = self.relay_client.create_session(self.host_id).await?;
        self.deployment
            .cache_relay_remote_session_id(self.host_id, remote_session.id)
            .await;
        self.remote_session = remote_session;
        Ok(())
    }
}

async fn get_or_create_cached_remote_session(
    deployment: &DeploymentImpl,
    relay_client: &RelayApiClient,
    host_id: Uuid,
) -> anyhow::Result<RemoteSession> {
    if let Some(session_id) = deployment.get_cached_relay_remote_session_id(host_id).await {
        return Ok(RemoteSession {
            host_id,
            id: session_id,
        });
    }

    let remote_session = relay_client.create_session(host_id).await?;
    deployment
        .cache_relay_remote_session_id(host_id, remote_session.id)
        .await;
    Ok(remote_session)
}

async fn get_or_create_cached_signing_session(
    deployment: &DeploymentImpl,
    relay_client: &RelayApiClient,
    remote_session: &RemoteSession,
    host_id: Uuid,
    client_id: Uuid,
    signing_key: &SigningKey,
) -> anyhow::Result<String> {
    if let Some(signing_session_id) = deployment
        .get_cached_relay_signing_session_id(host_id)
        .await
    {
        return Ok(signing_session_id);
    }

    let refreshed = relay_client
        .refresh_signing_session(remote_session, signing_key, client_id)
        .await?;
    let signing_session_id = refreshed.signing_session_id.to_string();
    deployment
        .cache_relay_signing_session_id(host_id, signing_session_id.clone())
        .await;
    Ok(signing_session_id)
}
