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
    #[error("missing authorization token")]
    MissingToken,
    #[error("invalid token header: {0}")]
    InvalidHeader(#[from] jsonwebtoken::errors::Error),
    #[error("token header missing `kid`")]
    MissingKeyId,
    #[error("failed to fetch JWKS: {0}")]
    JwksFetch(#[from] reqwest::Error),
    #[error("JWKS key `{0}` not found")]
    KeyNotFound(String),
    #[error("invalid JWKS key: {0}")]
    KeyConstruction(#[source] jsonwebtoken::errors::Error),
    #[error("invalid expiration: {0}")]
    InvalidExpiry(i64),
}

#[derive(Debug, Clone)]
pub struct ClerkIdentity {
    pub user_id: String,
    pub org_id: Option<String>,
    pub org_slug: Option<String>,
    pub session_id: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct ClerkSession {
    token: String,
    pub user_id: String,
    pub org_id: Option<String>,
    pub org_slug: Option<String>,
    pub session_id: String,
    pub expires_at: DateTime<Utc>,
}

impl ClerkSession {
    pub fn from_parts(token: String, identity: ClerkIdentity) -> Self {
        Self {
            token,
            user_id: identity.user_id,
            org_id: identity.org_id,
            org_slug: identity.org_slug,
            session_id: identity.session_id,
            expires_at: identity.expires_at,
        }
    }

    pub fn bearer(&self) -> &str {
        &self.token
    }

    pub fn is_expired(&self) -> bool {
        let safety_margin = chrono::Duration::seconds(5);
        self.expires_at <= Utc::now() + safety_margin
    }
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
struct ClerkOrganizationClaim {
    id: String,
    #[serde(default)]
    slg: Option<String>,
    #[serde(default)]
    rol: Option<String>,
    #[serde(default)]
    per: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
struct ClerkClaims {
    sub: String,
    sid: String,
    exp: i64,
    #[serde(default)]
    iss: Option<String>,
    #[serde(default)]
    o: Option<ClerkOrganizationClaim>,
}

fn claims_to_identity(token: TokenData<ClerkClaims>) -> Result<ClerkIdentity, ClerkAuthError> {
    let ClerkClaims {
        sub, sid, exp, o, ..
    } = token.claims;

    let expires_at = Utc
        .timestamp_opt(exp, 0)
        .single()
        .ok_or(ClerkAuthError::InvalidExpiry(exp))?;

    let (org_id, org_slug) = match o {
        Some(org) => (Some(org.id.clone()), org.slg),
        None => (None, None),
    };

    Ok(ClerkIdentity {
        user_id: sub,
        org_id,
        org_slug,
        session_id: sid,
        expires_at,
    })
}

#[derive(Clone)]
pub struct ClerkAuth {
    issuer: Url,
    client: Client,
    jwks: Arc<DashMap<String, DecodingKey>>,
}

impl ClerkAuth {
    pub fn new(issuer: Url) -> Result<Self, ClerkAuthError> {
        let client = Client::builder().timeout(Duration::from_secs(30)).build()?;
        Ok(Self {
            issuer,
            client,
            jwks: Arc::new(DashMap::new()),
        })
    }

    pub fn issuer(&self) -> &Url {
        &self.issuer
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
        let issuer = self.issuer.as_str().trim_end_matches('/');
        validation.set_issuer(&[issuer]);
        validation.validate_exp = true;

        let claims = decode::<ClerkClaims>(bearer, &decoding_key, &validation)?;
        claims_to_identity(claims)
    }

    async fn fetch_key(&self, kid: &str) -> Result<DecodingKey, ClerkAuthError> {
        let jwks_url = self
            .issuer
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

    pub async fn last(&self) -> Option<ClerkSession> {
        let guard = self.inner.read().await;
        guard.clone()
    }

    async fn active(&self) -> Option<ClerkSession> {
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
