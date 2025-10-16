use std::env;

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

    pub fn build_auth(&self) -> Result<ClerkAuth, ClerkAuthError> {
        ClerkAuth::new(self.issuer.clone())
    }
}
