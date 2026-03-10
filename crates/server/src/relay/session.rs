use deployment::Deployment;
use ed25519_dalek::{SigningKey, VerifyingKey};
use futures_util::future::BoxFuture;
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

#[derive(Debug)]
pub enum RelayHostContextInitError {
    ClientBuild(RelayClientBuildError),
    Metadata(PairedRelayHostMetadataError),
    Session(RelayHostSessionInitError),
}

#[derive(Debug, Clone, Copy)]
pub enum RelayOperationAttempt {
    Initial,
    AfterSigningRefresh,
    AfterSessionRotation,
}

#[derive(Debug)]
pub enum RelayRecoveryError<E> {
    Operation {
        error: E,
        attempt: RelayOperationAttempt,
    },
    Refresh(anyhow::Error),
    Rotate(anyhow::Error),
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

async fn load_paired_relay_host_metadata(
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

pub struct RelayHostContext {
    metadata: PairedRelayHostMetadata,
    session: RelayHostSession,
}

impl RelayHostContext {
    pub async fn for_host(
        deployment: &DeploymentImpl,
        host_id: Uuid,
    ) -> Result<Self, RelayHostContextInitError> {
        let metadata = load_paired_relay_host_metadata(deployment, host_id)
            .await
            .map_err(RelayHostContextInitError::Metadata)?;
        let relay_client = build_relay_client(deployment)
            .await
            .map_err(RelayHostContextInitError::ClientBuild)?;
        let session = RelayHostSession::for_host(
            deployment,
            relay_client,
            host_id,
            metadata.client_id,
            deployment.relay_signing().signing_key().clone(),
        )
        .await
        .map_err(RelayHostContextInitError::Session)?;

        Ok(Self { metadata, session })
    }

    pub fn into_parts(self) -> (PairedRelayHostMetadata, RelayHostSession) {
        (self.metadata, self.session)
    }
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

    pub async fn retry_response_recovery<T, RetryCheck, Operation>(
        &mut self,
        mut operation: Operation,
        should_retry: RetryCheck,
        refresh_failure_context: &'static str,
        rotate_failure_context: &'static str,
    ) -> anyhow::Result<T>
    where
        RetryCheck: Fn(&T) -> bool,
        Operation: for<'a> FnMut(&'a Self) -> BoxFuture<'a, anyhow::Result<T>>,
    {
        let first = operation(self).await?;
        if !should_retry(&first) {
            return Ok(first);
        }

        if self
            .refresh_signing_session_with_context(refresh_failure_context)
            .await
            .is_err()
        {
            return Ok(first);
        }

        let second = operation(self).await?;
        if !should_retry(&second) {
            return Ok(second);
        }

        if self
            .rotate_remote_session_with_context(rotate_failure_context)
            .await
            .is_err()
        {
            return Ok(second);
        }

        operation(self).await
    }

    pub async fn retry_error_recovery<T, E, RetryCheck, Operation>(
        &mut self,
        mut operation: Operation,
        should_retry: RetryCheck,
        refresh_failure_context: &'static str,
        rotate_failure_context: &'static str,
    ) -> Result<T, RelayRecoveryError<E>>
    where
        RetryCheck: Fn(&E) -> bool,
        Operation: for<'a> FnMut(&'a Self) -> BoxFuture<'a, Result<T, E>>,
    {
        match operation(self).await {
            Ok(value) => return Ok(value),
            Err(error) if !should_retry(&error) => {
                return Err(RelayRecoveryError::Operation {
                    error,
                    attempt: RelayOperationAttempt::Initial,
                });
            }
            Err(_) => {}
        }

        self.refresh_signing_session_with_context(refresh_failure_context)
            .await
            .map_err(RelayRecoveryError::Refresh)?;

        match operation(self).await {
            Ok(value) => return Ok(value),
            Err(error) if !should_retry(&error) => {
                return Err(RelayRecoveryError::Operation {
                    error,
                    attempt: RelayOperationAttempt::AfterSigningRefresh,
                });
            }
            Err(_) => {}
        }

        self.rotate_remote_session_with_context(rotate_failure_context)
            .await
            .map_err(RelayRecoveryError::Rotate)?;

        operation(self)
            .await
            .map_err(|error| RelayRecoveryError::Operation {
                error,
                attempt: RelayOperationAttempt::AfterSessionRotation,
            })
    }

    async fn refresh_signing_session_with_context(
        &mut self,
        failure_context: &'static str,
    ) -> anyhow::Result<()> {
        self.refresh_signing_session().await.map_err(|error| {
            tracing::warn!(
                ?error,
                host_id = %self.host_id,
                context = failure_context,
                "Relay signing session refresh failed"
            );
            error
        })
    }

    async fn rotate_remote_session_with_context(
        &mut self,
        failure_context: &'static str,
    ) -> anyhow::Result<()> {
        self.rotate_remote_session().await.map_err(|error| {
            tracing::warn!(
                ?error,
                host_id = %self.host_id,
                context = failure_context,
                "Relay remote session rotation failed"
            );
            error
        })
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
