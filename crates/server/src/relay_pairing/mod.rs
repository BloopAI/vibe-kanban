pub mod client;
pub mod server;

use deployment::Deployment;

use crate::{
    DeploymentImpl,
    relay_pairing::{
        client::RelayPairingClient,
        server::{RelayPairingEvents, RelayPairingServer},
    },
};

pub fn build_relay_pairing_client(deployment: &DeploymentImpl) -> RelayPairingClient {
    let client = RelayPairingClient::new(deployment.relay_host_store());
    let Ok(remote_client) = deployment.remote_client() else {
        return client;
    };
    let Some(relay_base_url) = deployment.shared_api_base() else {
        return client;
    };

    client.with_runtime(
        remote_client,
        relay_base_url,
        deployment.relay_signing().signing_key().clone(),
    )
}

pub fn build_relay_pairing_server(deployment: &DeploymentImpl) -> RelayPairingServer {
    RelayPairingServer::new(
        deployment.trusted_key_auth().clone(),
        deployment.relay_signing().clone(),
        RelayPairingEvents::new(
            deployment.user_id().to_string(),
            deployment.config().clone(),
            deployment.analytics().clone(),
        ),
    )
}
