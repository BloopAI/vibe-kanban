pub mod transport;

use deployment::Deployment;
use transport::{HostRelayResolveError, ResolvedHostRelay};
use uuid::Uuid;

use crate::DeploymentImpl;

pub async fn open_host_relay(
    deployment: &DeploymentImpl,
    host_id: Uuid,
) -> Result<ResolvedHostRelay, HostRelayResolveError> {
    let remote_client = deployment
        .remote_client()
        .map_err(|_| HostRelayResolveError::RelayNotConfigured)?;
    let relay_base_url =
        Deployment::shared_api_base(deployment).ok_or(HostRelayResolveError::RelayNotConfigured)?;

    ResolvedHostRelay::open(
        host_id,
        deployment.relay_host_store(),
        remote_client,
        relay_base_url,
        deployment.relay_signing().signing_key().clone(),
    )
    .await
}
