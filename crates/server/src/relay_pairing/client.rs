use anyhow::Context as _;
use chrono::Utc;
use ed25519_dalek::SigningKey;
use local_deployment::relay_host_store::RelayHostStore;
use relay_client::RelayApiClient;
use relay_types::{PairRelayHostRequest, RelayPairedHost};
use services::services::remote_client::RemoteClient;
use uuid::Uuid;

#[derive(Debug)]
pub enum RelayPairingClientError {
    NotConfigured,
    Authentication(anyhow::Error),
    Pairing(anyhow::Error),
    Store(anyhow::Error),
}

#[derive(Clone)]
struct RelayPairingRuntime {
    remote_client: RemoteClient,
    relay_base_url: String,
    signing_key: SigningKey,
}

#[derive(Clone)]
pub struct RelayPairingClient {
    store: RelayHostStore,
    runtime: Option<RelayPairingRuntime>,
}

impl RelayPairingClient {
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
        signing_key: SigningKey,
    ) -> Self {
        self.runtime = Some(RelayPairingRuntime {
            remote_client,
            relay_base_url,
            signing_key,
        });
        self
    }

    pub async fn pair_host(
        &self,
        req: &PairRelayHostRequest,
    ) -> Result<(), RelayPairingClientError> {
        let runtime = self
            .runtime
            .as_ref()
            .ok_or(RelayPairingClientError::NotConfigured)?;
        let access_token = runtime
            .remote_client
            .access_token()
            .await
            .context("Failed to get access token for relay auth code")
            .map_err(RelayPairingClientError::Authentication)?;
        let relay_client = RelayApiClient::new(runtime.relay_base_url.clone(), access_token);
        let relay_client::PairRelayHostResult {
            signing_session_id,
            client_id,
            server_public_key_b64,
        } = relay_client
            .pair_host(req, &runtime.signing_key)
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
}
