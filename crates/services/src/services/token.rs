use std::sync::Arc;

use chrono::{DateTime, Duration, TimeZone, Utc};
use remote::api::oauth::GitHubTokenResponse;
use reqwest::{Client, StatusCode};
use secrecy::SecretString;
use thiserror::Error;
use tokio::sync::RwLock;
use url::Url;
use utils::clerk::{ClerkSession, ClerkSessionStore};

use crate::services::config::Config;

const EXPIRY_MARGIN: Duration = Duration::seconds(30);

#[derive(Debug, Clone)]
pub enum GitHubTokenSource {
    PersonalAccessToken,
    ClerkOAuth,
}

#[derive(Debug, Clone)]
pub struct GitHubAccessToken {
    pub token: SecretString,
    pub expires_at: Option<DateTime<Utc>>,
    pub source: GitHubTokenSource,
}

#[derive(Debug, Error)]
pub enum GitHubTokenError {
    #[error("GitHub remote service not configured")]
    RemoteNotConfigured,
    #[error("Clerk session missing or expired")]
    MissingClerkSession,
    #[error("GitHub account not linked in Clerk")]
    NotLinked,
    #[error("invalid GitHub token expiry: {0}")]
    InvalidExpiry(i64),
    #[error("failed to build GitHub token endpoint: {0}")]
    InvalidEndpoint(#[from] url::ParseError),
    #[error("unexpected GitHub token response: {status}")]
    UnexpectedStatus { status: StatusCode },
    #[error(transparent)]
    Http(#[from] reqwest::Error),
}

#[derive(Clone)]
pub struct GitHubTokenProvider {
    client: Client,
    user_config: Arc<RwLock<Config>>,
    sessions: ClerkSessionStore,
    remote_api_base: Option<Url>,
    cache: Arc<RwLock<Option<CachedToken>>>,
}

impl GitHubTokenProvider {
    pub fn new(
        user_config: Arc<RwLock<Config>>,
        remote_api_base: Option<Url>,
        sessions: ClerkSessionStore,
    ) -> Self {
        Self {
            client: Client::new(),
            user_config,
            sessions,
            remote_api_base,
            cache: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn access_token(&self) -> Result<GitHubAccessToken, GitHubTokenError> {
        if let Some(pat) = self.personal_access_token().await {
            return Ok(pat);
        }

        if let Some(cached) = self.cached_token().await {
            return Ok(cached);
        }

        let session = self
            .sessions
            .last()
            .await
            .filter(|session| !session.is_expired())
            .ok_or(GitHubTokenError::MissingClerkSession)?;

        let token = self.fetch_remote_token(&session).await?;
        self.store_cache(&token).await;
        Ok(token)
    }

    pub async fn invalidate(&self) {
        let mut guard = self.cache.write().await;
        guard.take();
    }

    async fn personal_access_token(&self) -> Option<GitHubAccessToken> {
        let cfg = self.user_config.read().await;
        cfg.github.pat.as_ref().map(|value| GitHubAccessToken {
            token: SecretString::new(value.clone().into()),
            expires_at: None,
            source: GitHubTokenSource::PersonalAccessToken,
        })
    }

    async fn cached_token(&self) -> Option<GitHubAccessToken> {
        let entry = {
            let guard = self.cache.read().await;
            guard.clone()
        };

        if let Some(cached) = entry {
            if cached.is_expired() {
                let mut guard = self.cache.write().await;
                guard.take();
                None
            } else {
                Some(cached.token.clone())
            }
        } else {
            None
        }
    }

    async fn store_cache(&self, token: &GitHubAccessToken) {
        let mut guard = self.cache.write().await;
        guard.replace(CachedToken {
            token: token.clone(),
        });
    }

    async fn fetch_remote_token(
        &self,
        session: &ClerkSession,
    ) -> Result<GitHubAccessToken, GitHubTokenError> {
        let url = self.remote_endpoint()?;
        let response = self
            .client
            .get(url)
            .bearer_auth(session.bearer())
            .send()
            .await?;

        match response.status() {
            StatusCode::OK => {}
            StatusCode::PRECONDITION_FAILED => return Err(GitHubTokenError::NotLinked),
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                return Err(GitHubTokenError::MissingClerkSession);
            }
            status => return Err(GitHubTokenError::UnexpectedStatus { status }),
        }

        let payload: GitHubTokenResponse = response.json().await?;
        let expires_at = match payload.expires_at {
            Some(ts) => Some(
                Utc.timestamp_opt(ts, 0)
                    .single()
                    .ok_or(GitHubTokenError::InvalidExpiry(ts))?,
            ),
            None => None,
        };

        Ok(GitHubAccessToken {
            token: SecretString::new(payload.access_token.into()),
            expires_at,
            source: GitHubTokenSource::ClerkOAuth,
        })
    }

    fn remote_endpoint(&self) -> Result<Url, GitHubTokenError> {
        if let Some(remote_api_base) = &self.remote_api_base {
            remote_api_base
                .join("/v1/oauth/github/token")
                .map_err(GitHubTokenError::InvalidEndpoint)
        } else {
            Err(GitHubTokenError::RemoteNotConfigured)
        }
    }
}

#[derive(Debug, Clone)]
struct CachedToken {
    token: GitHubAccessToken,
}

impl CachedToken {
    fn is_expired(&self) -> bool {
        match self.token.expires_at {
            Some(expires_at) => expires_at <= Utc::now() + EXPIRY_MARGIN,
            None => false,
        }
    }
}
