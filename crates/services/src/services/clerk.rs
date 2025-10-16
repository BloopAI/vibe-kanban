use std::{sync::Arc, time::Duration};

use chrono::{DateTime, TimeZone, Utc};
use dashmap::DashMap;
use jsonwebtoken::{
    Algorithm, DecodingKey, TokenData, Validation, decode, decode_header,
    jwk::{AlgorithmParameters, JwkSet},
};
use reqwest::Client;
use serde::Deserialize;
use thiserror::Error;
use tokio::{sync::RwLock, time::sleep};
use url::Url;

#[derive(Debug, Error)]
pub enum ClerkAuthError {
    #[error("environment variable `{0}` is not set")]
    MissingEnv(&'static str),
    #[error("environment variable `{0}` has an invalid value")]
    InvalidEnv(&'static str),
    #[error("missing authorization header")]
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
pub struct ClerkPublicConfig {
    issuer: Url,
}

impl ClerkPublicConfig {
    pub fn from_env() -> Result<Self, ClerkAuthError> {
        let issuer = std::env::var("CLERK_ISSUER")
            .map_err(|_| ClerkAuthError::MissingEnv("CLERK_ISSUER"))?
            .parse()
            .map_err(|_| ClerkAuthError::InvalidEnv("CLERK_ISSUER"))?;

        Ok(Self { issuer })
    }

    pub fn issuer(&self) -> &Url {
        &self.issuer
    }
}

#[derive(Debug, Clone)]
pub struct ClerkIdentity {
    pub user_id: String,
    pub org_id: Option<String>,
    pub session_id: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct ClerkSession {
    token: String,
    pub user_id: String,
    pub org_id: Option<String>,
    pub session_id: String,
    pub expires_at: DateTime<Utc>,
}

impl ClerkSession {
    pub fn from_parts(token: String, identity: ClerkIdentity) -> Self {
        Self {
            token,
            user_id: identity.user_id,
            org_id: identity.org_id,
            session_id: identity.session_id,
            expires_at: identity.expires_at,
        }
    }

    pub fn bearer(&self) -> &str {
        &self.token
    }

    pub fn is_expired(&self) -> bool {
        let safety_margin = chrono::Duration::seconds(30);
        self.expires_at <= Utc::now() + safety_margin
    }
}

#[derive(Debug, Deserialize)]
struct ClerkClaims {
    sub: String,
    sid: String,
    exp: i64,
    #[serde(default, rename = "organization_id")]
    organization_id: Option<String>,
}

fn claims_to_identity(token: TokenData<ClerkClaims>) -> Result<ClerkIdentity, ClerkAuthError> {
    let ClerkClaims {
        sub,
        sid,
        exp,
        organization_id,
    } = token.claims;

    let expires_at = Utc
        .timestamp_opt(exp, 0)
        .single()
        .ok_or(ClerkAuthError::InvalidExpiry(exp))?;

    Ok(ClerkIdentity {
        user_id: sub,
        org_id: organization_id,
        session_id: sid,
        expires_at,
    })
}

#[derive(Clone)]
pub struct ClerkAuth {
    config: ClerkPublicConfig,
    client: Client,
    jwks: Arc<DashMap<String, DecodingKey>>,
}

impl ClerkAuth {
    pub fn new(config: ClerkPublicConfig) -> Result<Self, ClerkAuthError> {
        let client = Client::builder().timeout(Duration::from_secs(30)).build()?;

        Ok(Self {
            config,
            client,
            jwks: Arc::new(DashMap::new()),
        })
    }

    pub fn issuer(&self) -> &Url {
        self.config.issuer()
    }

    pub async fn verify(&self, bearer: &str) -> Result<ClerkIdentity, ClerkAuthError> {
        if bearer.trim().is_empty() {
            return Err(ClerkAuthError::MissingToken);
        }

        let header = decode_header(bearer)?;
        let kid = header.kid.ok_or(ClerkAuthError::MissingKeyId)?;

        let decoding_key = match self.jwks.get(&kid) {
            Some(key) => key.clone(),
            None => self.fetch_key(&kid).await?,
        };

        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[self.config.issuer().as_str()]);
        validation.validate_exp = true;

        let claims = decode::<ClerkClaims>(bearer, &decoding_key, &validation)?;
        claims_to_identity(claims)
    }

    async fn fetch_key(&self, kid: &str) -> Result<DecodingKey, ClerkAuthError> {
        let jwks_url = self
            .config
            .issuer()
            .join("/.well-known/jwks.json")
            .expect("issuer missing /.well-known path");

        let jwks: JwkSet = self.client.get(jwks_url).send().await?.json().await?;
        let key = jwks
            .find(kid)
            .ok_or_else(|| ClerkAuthError::KeyNotFound(kid.to_owned()))?;

        let rsa = match &key.algorithm {
            AlgorithmParameters::RSA(params) => params,
            _ => return Err(ClerkAuthError::KeyNotFound(kid.to_owned())),
        };

        let decoding_key = DecodingKey::from_rsa_components(&rsa.n, &rsa.e)
            .map_err(ClerkAuthError::KeyConstruction)?;
        self.jwks.insert(kid.to_owned(), decoding_key.clone());
        Ok(decoding_key)
    }
}

#[derive(Clone, Default)]
pub struct ClerkSessionStore {
    inner: Arc<RwLock<Option<ClerkSession>>>,
}

impl ClerkSessionStore {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn set(&self, session: ClerkSession) {
        self.inner.write().await.replace(session);
    }

    pub async fn clear(&self) {
        self.inner.write().await.take();
    }

    pub async fn active(&self) -> Option<ClerkSession> {
        let guard = self.inner.read().await;
        guard
            .as_ref()
            .filter(|session| !session.is_expired())
            .cloned()
    }

    pub async fn wait_for_active(&self) -> ClerkSession {
        loop {
            if let Some(session) = self.active().await {
                return session;
            }
            sleep(Duration::from_secs(2)).await;
        }
    }
}
