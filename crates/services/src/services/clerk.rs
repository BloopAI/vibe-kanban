use std::{env, sync::Arc, time::Duration};

pub use remote::api::identity::IdentityResponse as UserIdentity;
use reqwest::Client;
use thiserror::Error;
use url::Url;
pub use utils::clerk::{ClerkAuth, ClerkAuthError, ClerkIdentity, ClerkSession, ClerkSessionStore};

#[derive(Debug, Error)]
pub enum ClerkPublicConfigError {
    #[error("environment variable `{0}` is not set")]
    MissingEnv(&'static str),
    #[error("environment variable `{0}` has an invalid value")]
    InvalidEnv(&'static str),
}

#[derive(Debug, Clone)]
pub struct ClerkPublicConfig {
    issuer: Url,
}

impl ClerkPublicConfig {
    pub fn from_env() -> Result<Self, ClerkPublicConfigError> {
        let issuer = env::var("CLERK_ISSUER")
            .map_err(|_| ClerkPublicConfigError::MissingEnv("CLERK_ISSUER"))?
            .parse()
            .map_err(|_| ClerkPublicConfigError::InvalidEnv("CLERK_ISSUER"))?;

        Ok(Self { issuer })
    }

    pub fn issuer(&self) -> &Url {
        &self.issuer
    }

    pub fn build_auth(
        &self,
        remote_api_base: Option<Url>,
    ) -> Result<ClerkService, ClerkServiceError> {
        ClerkService::new(self.issuer.clone(), remote_api_base)
    }
}

#[derive(Debug, Error)]
pub enum ClerkServiceError {
    #[error(transparent)]
    Auth(#[from] ClerkAuthError),
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error(transparent)]
    Url(#[from] url::ParseError),
    #[error("remote Clerk API not configured")]
    RemoteNotConfigured,
}

#[derive(Clone)]
pub struct ClerkService {
    auth: Arc<ClerkAuth>,
    client: Client,
    remote_endpoint: Option<Url>,
}

impl ClerkService {
    pub fn new(issuer: Url, remote_api_base: Option<Url>) -> Result<Self, ClerkServiceError> {
        let auth = Arc::new(ClerkAuth::new(issuer)?);
        let client = Client::builder().timeout(Duration::from_secs(30)).build()?;
        let remote_endpoint = remote_api_base
            .map(|base| base.join("v1/identity"))
            .transpose()?;

        Ok(Self {
            auth,
            client,
            remote_endpoint,
        })
    }

    pub fn auth(&self) -> Arc<ClerkAuth> {
        self.auth.clone()
    }

    pub async fn verify(&self, token: &str) -> Result<ClerkIdentity, ClerkAuthError> {
        self.auth.verify(token).await
    }

    pub async fn identify(&self, token: &str) -> Result<UserIdentity, ClerkServiceError> {
        let endpoint = self
            .remote_endpoint
            .clone()
            .ok_or(ClerkServiceError::RemoteNotConfigured)?;

        let response = self
            .client
            .get(endpoint)
            .bearer_auth(token)
            .send()
            .await?
            .error_for_status()?;

        Ok(response.json::<UserIdentity>().await?)
    }
}
