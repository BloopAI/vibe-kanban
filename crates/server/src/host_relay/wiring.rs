use deployment::Deployment;

use crate::{DeploymentImpl, host_relay::transport::HostRelayResolver};

#[derive(Debug, Clone, Copy)]
pub enum HostRelayResolverBuildError {
    NotConfigured,
}

pub fn build_host_relay_resolver(
    deployment: &DeploymentImpl,
) -> Result<HostRelayResolver, HostRelayResolverBuildError> {
    let remote_client = deployment
        .remote_client()
        .map_err(|_| HostRelayResolverBuildError::NotConfigured)?;
    let relay_base_url = deployment
        .shared_api_base()
        .ok_or(HostRelayResolverBuildError::NotConfigured)?;

    Ok(HostRelayResolver::new(
        deployment.relay_host_store(),
        remote_client,
        relay_base_url,
        deployment.relay_signing().signing_key().clone(),
    ))
}
