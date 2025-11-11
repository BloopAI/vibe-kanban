use std::{collections::HashMap, sync::Arc};

use anyhow::{Context, Result};
use async_trait::async_trait;
use chrono::Duration;
use reqwest::Client;
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;
use url::Url;

const USER_AGENT: &str = "VibeKanbanRemote/1.0";

#[derive(Debug, Clone)]
pub struct AuthorizationGrant {
    pub access_token: SecretString,
    pub token_type: String,
    pub scopes: Vec<String>,
    pub refresh_token: Option<SecretString>,
    pub expires_in: Option<Duration>,
    pub id_token: Option<SecretString>,
}

#[derive(Debug)]
pub struct ProviderUser {
    pub id: String,
    pub login: Option<String>,
    pub email: Option<String>,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[async_trait]
pub trait AuthorizationProvider: Send + Sync {
    fn name(&self) -> &'static str;
    fn scopes(&self) -> &[&str];
    fn authorize_url(&self, state: &str, redirect_uri: &str) -> Result<Url>;
    async fn exchange_code(&self, code: &str, redirect_uri: &str) -> Result<AuthorizationGrant>;
    async fn fetch_user(&self, access_token: &SecretString) -> Result<ProviderUser>;
}

#[derive(Default)]
pub struct ProviderRegistry {
    providers: HashMap<String, Arc<dyn AuthorizationProvider>>,
}

impl ProviderRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register<P>(&mut self, provider: P)
    where
        P: AuthorizationProvider + 'static,
    {
        let key = provider.name().to_lowercase();
        self.providers.insert(key, Arc::new(provider));
    }

    pub fn get(&self, provider: &str) -> Option<Arc<dyn AuthorizationProvider>> {
        let key = provider.to_lowercase();
        self.providers.get(&key).cloned()
    }

    pub fn is_empty(&self) -> bool {
        self.providers.is_empty()
    }
}

pub struct GitHubOAuthProvider {
    client: Client,
    client_id: String,
    client_secret: SecretString,
}

impl GitHubOAuthProvider {
    pub fn new(client_id: String, client_secret: SecretString) -> Result<Self> {
        let client = Client::builder().user_agent(USER_AGENT).build()?;
        Ok(Self {
            client,
            client_id,
            client_secret,
        })
    }

    fn parse_scopes(scope: Option<String>) -> Vec<String> {
        scope
            .unwrap_or_default()
            .split(',')
            .filter_map(|value| {
                let trimmed = value.trim();
                (!trimmed.is_empty()).then_some(trimmed.to_string())
            })
            .collect()
    }
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum GitHubTokenResponse {
    Success {
        access_token: String,
        scope: Option<String>,
        token_type: String,
    },
    Error {
        error: String,
        error_description: Option<String>,
    },
}

#[derive(Debug, Deserialize)]
struct GitHubUser {
    id: i64,
    login: String,
    email: Option<String>,
    name: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubEmail {
    email: String,
    primary: bool,
    verified: bool,
}

#[async_trait]
impl AuthorizationProvider for GitHubOAuthProvider {
    fn name(&self) -> &'static str {
        "github"
    }

    fn scopes(&self) -> &[&str] {
        &["read:user", "user:email"]
    }

    fn authorize_url(&self, state: &str, redirect_uri: &str) -> Result<Url> {
        let mut url = Url::parse("https://github.com/login/oauth/authorize")?;
        {
            let mut qp = url.query_pairs_mut();
            qp.append_pair("client_id", &self.client_id);
            qp.append_pair("state", state);
            qp.append_pair("redirect_uri", redirect_uri);
            qp.append_pair("allow_signup", "false");
            qp.append_pair("scope", &self.scopes().join(" "));
        }
        Ok(url)
    }

    async fn exchange_code(&self, code: &str, redirect_uri: &str) -> Result<AuthorizationGrant> {
        let response = self
            .client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.expose_secret()),
                ("code", code),
                ("redirect_uri", redirect_uri),
            ])
            .send()
            .await?
            .error_for_status()?;

        match response.json::<GitHubTokenResponse>().await? {
            GitHubTokenResponse::Success {
                access_token,
                scope,
                token_type,
            } => Ok(AuthorizationGrant {
                access_token: SecretString::new(access_token.into()),
                token_type,
                scopes: Self::parse_scopes(scope),
                refresh_token: None,
                expires_in: None,
                id_token: None,
            }),
            GitHubTokenResponse::Error {
                error,
                error_description,
            } => {
                let detail = error_description.unwrap_or_else(|| error.clone());
                anyhow::bail!("github token exchange failed: {detail}")
            }
        }
    }

    async fn fetch_user(&self, access_token: &SecretString) -> Result<ProviderUser> {
        let bearer = format!("Bearer {}", access_token.expose_secret());

        let user: GitHubUser = self
            .client
            .get("https://api.github.com/user")
            .header("Accept", "application/vnd.github+json")
            .header("Authorization", &bearer)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        let email = if user.email.is_some() {
            user.email
        } else {
            let response = self
                .client
                .get("https://api.github.com/user/emails")
                .header("Accept", "application/vnd.github+json")
                .header("Authorization", bearer)
                .send()
                .await?;

            if response.status().is_success() {
                let emails: Vec<GitHubEmail> = response
                    .json()
                    .await
                    .context("failed to parse GitHub email response")?;
                emails
                    .into_iter()
                    .find(|entry| entry.primary && entry.verified)
                    .map(|entry| entry.email)
            } else {
                None
            }
        };

        Ok(ProviderUser {
            id: user.id.to_string(),
            login: Some(user.login),
            email,
            name: user.name,
            avatar_url: user.avatar_url,
        })
    }
}

pub struct GoogleOAuthProvider {
    client: Client,
    client_id: String,
    client_secret: SecretString,
}

impl GoogleOAuthProvider {
    pub fn new(client_id: String, client_secret: SecretString) -> Result<Self> {
        let client = Client::builder().user_agent(USER_AGENT).build()?;
        Ok(Self {
            client,
            client_id,
            client_secret,
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum GoogleTokenResponse {
    Success {
        access_token: String,
        token_type: String,
        scope: Option<String>,
        expires_in: Option<i64>,
        refresh_token: Option<String>,
        id_token: Option<String>,
    },
    Error {
        error: String,
        error_description: Option<String>,
    },
}

#[derive(Debug, Deserialize)]
struct GoogleUser {
    sub: String,
    email: Option<String>,
    name: Option<String>,
    given_name: Option<String>,
    family_name: Option<String>,
    picture: Option<String>,
}

#[async_trait]
impl AuthorizationProvider for GoogleOAuthProvider {
    fn name(&self) -> &'static str {
        "google"
    }

    fn scopes(&self) -> &[&str] {
        &["openid", "email", "profile"]
    }

    fn authorize_url(&self, state: &str, redirect_uri: &str) -> Result<Url> {
        let mut url = Url::parse("https://accounts.google.com/o/oauth2/v2/auth")?;
        {
            let mut qp = url.query_pairs_mut();
            qp.append_pair("client_id", &self.client_id);
            qp.append_pair("redirect_uri", redirect_uri);
            qp.append_pair("response_type", "code");
            qp.append_pair("scope", &self.scopes().join(" "));
            qp.append_pair("state", state);
            qp.append_pair("access_type", "offline");
            qp.append_pair("prompt", "consent");
        }
        Ok(url)
    }

    async fn exchange_code(&self, code: &str, redirect_uri: &str) -> Result<AuthorizationGrant> {
        let response = self
            .client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.expose_secret()),
                ("code", code),
                ("grant_type", "authorization_code"),
                ("redirect_uri", redirect_uri),
            ])
            .send()
            .await?
            .error_for_status()?;

        match response.json::<GoogleTokenResponse>().await? {
            GoogleTokenResponse::Success {
                access_token,
                token_type,
                scope,
                expires_in,
                refresh_token,
                id_token,
            } => {
                let scopes = scope
                    .unwrap_or_default()
                    .split_whitespace()
                    .filter_map(|value| {
                        let trimmed = value.trim();
                        (!trimmed.is_empty()).then_some(trimmed.to_string())
                    })
                    .collect();

                Ok(AuthorizationGrant {
                    access_token: SecretString::new(access_token.into()),
                    token_type,
                    scopes,
                    refresh_token: refresh_token.map(|v| SecretString::new(v.into())),
                    expires_in: expires_in.map(Duration::seconds),
                    id_token: id_token.map(|v| SecretString::new(v.into())),
                })
            }
            GoogleTokenResponse::Error {
                error,
                error_description,
            } => {
                let detail = error_description.unwrap_or_else(|| error.clone());
                anyhow::bail!("google token exchange failed: {detail}")
            }
        }
    }

    async fn fetch_user(&self, access_token: &SecretString) -> Result<ProviderUser> {
        let bearer = format!("Bearer {}", access_token.expose_secret());

        let profile: GoogleUser = self
            .client
            .get("https://openidconnect.googleapis.com/v1/userinfo")
            .header("Authorization", bearer)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        let login = profile.email.clone();
        let name = profile
            .name
            .or_else(|| match (profile.given_name, profile.family_name) {
                (Some(first), Some(last)) => Some(format!("{first} {last}")),
                (Some(first), None) => Some(first),
                (None, Some(last)) => Some(last),
                (None, None) => None,
            });

        Ok(ProviderUser {
            id: profile.sub,
            login,
            email: profile.email,
            name,
            avatar_url: profile.picture,
        })
    }
}
