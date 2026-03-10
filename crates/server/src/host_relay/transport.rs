use deployment::Deployment;
use relay_client::{
    RelayApiClient, RelayHostIdentity, RelayHostTransport, RelayTransportBootstrapError,
};
use relay_types::{RelayAuthState, RemoteSession};
use trusted_key_auth::trusted_keys::parse_public_key_base64;
use uuid::Uuid;

use crate::DeploymentImpl;

#[derive(Debug)]
pub enum RelayClientBuildError {
    NotConfigured,
    Authentication(anyhow::Error),
}

#[derive(Debug, Clone, Copy)]
pub enum PairedRelayHostMetadataError {
    NotPaired,
    MissingClientMetadata,
    MissingSigningMetadata,
}

#[derive(Debug)]
pub enum RelayTransportBuildError {
    Metadata(PairedRelayHostMetadataError),
    ClientBuild(RelayClientBuildError),
    Bootstrap(RelayTransportBootstrapError),
}

pub async fn build_relay_host_transport(
    deployment: &DeploymentImpl,
    host_id: Uuid,
) -> Result<RelayHostTransport, RelayTransportBuildError> {
    let identity = load_paired_relay_host_identity(deployment, host_id)
        .await
        .map_err(RelayTransportBuildError::Metadata)?;
    let relay_client = build_relay_client(deployment)
        .await
        .map_err(RelayTransportBuildError::ClientBuild)?;
    let cached_auth_state = load_cached_relay_auth_state(deployment, host_id).await;

    RelayHostTransport::bootstrap(
        relay_client,
        identity,
        deployment.relay_signing().signing_key().clone(),
        cached_auth_state
            .as_ref()
            .map(|value| value.remote_session.clone()),
        cached_auth_state.map(|value| value.signing_session_id),
    )
    .await
    .map_err(RelayTransportBuildError::Bootstrap)
}

pub async fn persist_relay_auth_state(
    deployment: &DeploymentImpl,
    host_id: Uuid,
    auth_state: &RelayAuthState,
) {
    deployment
        .cache_relay_remote_session_id(host_id, auth_state.remote_session.id)
        .await;
    deployment
        .cache_relay_signing_session_id(host_id, auth_state.signing_session_id.clone())
        .await;
}

async fn build_relay_client(
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

async fn load_paired_relay_host_identity(
    deployment: &DeploymentImpl,
    host_id: Uuid,
) -> Result<RelayHostIdentity, PairedRelayHostMetadataError> {
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

    Ok(RelayHostIdentity {
        host_id,
        client_id,
        server_verify_key,
    })
}

async fn load_cached_relay_auth_state(
    deployment: &DeploymentImpl,
    host_id: Uuid,
) -> Option<RelayAuthState> {
    let remote_session_id = deployment
        .get_cached_relay_remote_session_id(host_id)
        .await?;
    let signing_session_id = deployment
        .get_cached_relay_signing_session_id(host_id)
        .await?;

    Some(RelayAuthState {
        remote_session: RemoteSession {
            host_id,
            id: remote_session_id,
        },
        signing_session_id,
    })
}
