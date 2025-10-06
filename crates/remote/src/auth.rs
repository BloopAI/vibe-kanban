use std::{sync::Arc, time::Duration};

use chrono::{DateTime, TimeZone, Utc};
use dashmap::DashMap;
use jsonwebtoken::{
    Algorithm, DecodingKey, TokenData, Validation, decode, decode_header,
    jwk::{AlgorithmParameters, JwkSet},
};
use reqwest::Client as HttpClient;
use serde::Deserialize;
use thiserror::Error;

mod middleware;
pub use middleware::{RequestContext, require_clerk_session};

use crate::config::ClerkConfig;

#[derive(Debug, Error)]
pub enum ClerkError {
    #[error("missing authorization token")]
    MissingToken,
    #[error("invalid token header: {0}")]
    InvalidHeader(#[from] jsonwebtoken::errors::Error),
    #[error("invalid JWKS key: {0}")]
    KeyConstruction(#[source] jsonwebtoken::errors::Error),
    #[error("token header missing `kid`")]
    MissingKeyId,
    #[error("failed to fetch JWKS: {0}")]
    JwksFetch(#[from] reqwest::Error),
    #[error("JWKS key `{0}` not found")]
    KeyNotFound(String),
    #[error("invalid expiration: {0}")]
    InvalidExpiry(i64),
}

#[derive(Debug, Clone)]
pub struct ClerkIdentity {
    pub user_id: String,
    pub org_id: Option<String>,
    pub session_id: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClerkClaims {
    sub: String,
    sid: String,
    iss: String,
    exp: i64,
    #[serde(default, rename = "organization_id")]
    organization_id: Option<String>,
}

fn claims_to_identity(token: TokenData<ClerkClaims>) -> Result<ClerkIdentity, ClerkError> {
    let ClerkClaims {
        sub,
        sid,
        exp,
        organization_id,
        ..
    } = token.claims;

    let expires_at = Utc
        .timestamp_opt(exp, 0)
        .single()
        .ok_or_else(|| ClerkError::InvalidExpiry(exp))?;

    Ok(ClerkIdentity {
        user_id: sub,
        org_id: organization_id,
        session_id: sid,
        expires_at,
    })
}

pub struct ClerkAuth {
    config: ClerkConfig,
    client: HttpClient,
    jwks: Arc<DashMap<String, DecodingKey>>,
}

impl ClerkAuth {
    pub(crate) fn new(config: &ClerkConfig) -> Result<Self, ClerkError> {
        let client = HttpClient::builder()
            .timeout(Duration::from_secs(30))
            .build()?;
        Ok(Self {
            config: config.clone(),
            client,
            jwks: Arc::new(DashMap::new()),
        })
    }

    pub(crate) async fn verify(&self, bearer: &str) -> Result<ClerkIdentity, ClerkError> {
        if bearer.trim().is_empty() {
            return Err(ClerkError::MissingToken);
        }

        let header = decode_header(bearer)?;
        let kid = header.kid.ok_or(ClerkError::MissingKeyId)?;

        let decoding_key = if let Some(key) = self.jwks.get(&kid) {
            key.clone()
        } else {
            self.fetch_key(&kid).await?
        };

        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[self.config.get_issuer()]);
        validation.validate_exp = true;

        let claims = decode::<ClerkClaims>(bearer, &decoding_key, &validation)?;
        claims_to_identity(claims)
    }

    async fn fetch_key(&self, kid: &str) -> Result<DecodingKey, ClerkError> {
        let jwks_url = self
            .config
            .get_issuer()
            .join("/.well-known/jwks.json")
            .expect("issuer missing /.well-known path");

        let jwks: JwkSet = self.client.get(jwks_url).send().await?.json().await?;
        let key = jwks
            .find(kid)
            .ok_or_else(|| ClerkError::KeyNotFound(kid.to_owned()))?;

        let rsa = match &key.algorithm {
            AlgorithmParameters::RSA(params) => params,
            _ => return Err(ClerkError::KeyNotFound(kid.to_owned())),
        };
        let decoding_key = DecodingKey::from_rsa_components(&rsa.n, &rsa.e)
            .map_err(ClerkError::KeyConstruction)?;

        self.jwks.insert(kid.to_owned(), decoding_key.clone());
        Ok(decoding_key)
    }
}
