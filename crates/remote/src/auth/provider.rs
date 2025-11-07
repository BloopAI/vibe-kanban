use std::{collections::HashMap, sync::Arc};

use anyhow::{Context, Result};
use async_trait::async_trait;
use chrono::Duration;
use reqwest::{Client, StatusCode};
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;

const USER_AGENT: &str = "VibeKanbanRemote/1.0";

#[derive(Debug, Clone)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub expires_in: Duration,
    pub interval: i32,
}

#[derive(Debug, Clone)]
pub struct DeviceAccessGrant {
    pub access_token: SecretString,
    pub token_type: String,
    pub scopes: Vec<String>,
    pub expires_in: Option<Duration>,
}

#[derive(Debug)]
pub enum ProviderAuthorization {
    Pending,
    SlowDown(u64),
    Denied,
    Expired,
    Authorized(DeviceAccessGrant),
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
pub trait DeviceAuthorizationProvider: Send + Sync {
    fn name(&self) -> &'static str;
    fn scopes(&self) -> &[&str];
    async fn request_device_code(&self, scopes: &[&str]) -> Result<DeviceCodeResponse>;
    async fn poll_device_code(&self, device_code: &str) -> Result<ProviderAuthorization>;
    async fn fetch_user(&self, access_token: &SecretString) -> Result<ProviderUser>;
}

#[derive(Default)]
pub struct ProviderRegistry {
    providers: HashMap<String, Arc<dyn DeviceAuthorizationProvider>>,
}

impl ProviderRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register<P>(&mut self, provider: P)
    where
        P: DeviceAuthorizationProvider + 'static,
    {
        let key = provider.name().to_lowercase();
        self.providers.insert(key, Arc::new(provider));
    }

    pub fn get(&self, provider: &str) -> Option<Arc<dyn DeviceAuthorizationProvider>> {
        let key = provider.to_lowercase();
        self.providers.get(&key).cloned()
    }

    pub fn is_empty(&self) -> bool {
        self.providers.is_empty()
    }
}

pub struct GitHubDeviceProvider {
    client: Client,
    client_id: String,
    client_secret: SecretString,
}

impl GitHubDeviceProvider {
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
struct GitHubDeviceCode {
    device_code: String,
    user_code: String,
    verification_uri: String,
    #[serde(default)]
    verification_uri_complete: Option<String>,
    expires_in: i64,
    interval: i32,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum GitHubTokenResponse {
    Success {
        access_token: String,
        token_type: String,
        scope: Option<String>,
        #[serde(default)]
        expires_in: Option<i64>,
    },
    Error {
        error: String,
        #[allow(dead_code)]
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
impl DeviceAuthorizationProvider for GitHubDeviceProvider {
    fn name(&self) -> &'static str {
        "github"
    }

    fn scopes(&self) -> &[&str] {
        &["repo", "read:user", "user:email"]
    }

    async fn request_device_code(&self, scopes: &[&str]) -> Result<DeviceCodeResponse> {
        let scope = scopes.join(" ");
        let response = self
            .client
            .post("https://github.com/login/device/code")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("scope", scope.as_str()),
            ])
            .send()
            .await?
            .error_for_status()?;

        let body: GitHubDeviceCode = response.json().await?;
        Ok(DeviceCodeResponse {
            device_code: body.device_code,
            user_code: body.user_code,
            verification_uri: body.verification_uri,
            verification_uri_complete: body.verification_uri_complete,
            expires_in: Duration::seconds(body.expires_in),
            interval: body.interval,
        })
    }

    async fn poll_device_code(&self, device_code: &str) -> Result<ProviderAuthorization> {
        let response = self
            .client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.expose_secret()),
                ("device_code", device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await?;

        if response.status() == StatusCode::BAD_REQUEST {
            let body: GitHubTokenResponse = response.json().await?;
            return Ok(match body {
                GitHubTokenResponse::Error { error, .. } => match error.as_str() {
                    "authorization_pending" => ProviderAuthorization::Pending,
                    "slow_down" => ProviderAuthorization::SlowDown(5),
                    "access_denied" => ProviderAuthorization::Denied,
                    "expired_token" => ProviderAuthorization::Expired,
                    _ => ProviderAuthorization::Denied,
                },
                GitHubTokenResponse::Success { .. } => ProviderAuthorization::Denied,
            });
        }

        let body: GitHubTokenResponse = response.error_for_status()?.json().await?;
        match body {
            GitHubTokenResponse::Success {
                access_token,
                token_type,
                scope,
                expires_in,
            } => Ok(ProviderAuthorization::Authorized(DeviceAccessGrant {
                access_token: SecretString::new(access_token.into()),
                token_type,
                scopes: Self::parse_scopes(scope),
                expires_in: expires_in.map(Duration::seconds),
            })),
            GitHubTokenResponse::Error { error, .. } => match error.as_str() {
                "authorization_pending" => Ok(ProviderAuthorization::Pending),
                "slow_down" => Ok(ProviderAuthorization::SlowDown(5)),
                "access_denied" => Ok(ProviderAuthorization::Denied),
                "expired_token" => Ok(ProviderAuthorization::Expired),
                _ => Ok(ProviderAuthorization::Denied),
            },
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

pub struct GoogleDeviceProvider {
    client: Client,
    client_id: String,
    client_secret: SecretString,
}

impl GoogleDeviceProvider {
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
struct GoogleDeviceCode {
    device_code: String,
    user_code: String,
    #[serde(default)]
    verification_url: Option<String>,
    #[serde(default)]
    verification_uri: Option<String>,
    #[serde(default)]
    verification_uri_complete: Option<String>,
    expires_in: i64,
    interval: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum GoogleTokenResponse {
    Success {
        access_token: String,
        token_type: String,
        scope: Option<String>,
        expires_in: Option<i64>,
    },
    Error {
        error: String,
        #[allow(dead_code)]
        error_description: Option<String>,
    },
}

#[derive(Debug, Deserialize)]
struct GoogleUser {
    sub: String,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    email_verified: Option<bool>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    given_name: Option<String>,
    #[serde(default)]
    family_name: Option<String>,
    #[serde(default)]
    picture: Option<String>,
}

#[async_trait]
impl DeviceAuthorizationProvider for GoogleDeviceProvider {
    fn name(&self) -> &'static str {
        "google"
    }

    fn scopes(&self) -> &[&str] {
        &["openid", "email", "profile"]
    }

    async fn request_device_code(&self, scopes: &[&str]) -> Result<DeviceCodeResponse> {
        let scope = scopes.join(" ");
        let response = self
            .client
            .post("https://oauth2.googleapis.com/device/code")
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("scope", scope.as_str()),
            ])
            .send()
            .await?
            .error_for_status()?;

        let body: GoogleDeviceCode = response.json().await?;
        let verification_uri = body
            .verification_uri
            .clone()
            .or(body.verification_url.clone())
            .unwrap_or_else(|| "https://www.google.com/device".to_string());

        Ok(DeviceCodeResponse {
            device_code: body.device_code.clone(),
            user_code: body.user_code.clone(),
            verification_uri,
            verification_uri_complete: body.verification_uri_complete.clone(),
            expires_in: Duration::seconds(body.expires_in),
            interval: body.interval.unwrap_or(5),
        })
    }

    async fn poll_device_code(&self, device_code: &str) -> Result<ProviderAuthorization> {
        let response = self
            .client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.expose_secret()),
                ("device_code", device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await?;

        match response.status() {
            StatusCode::BAD_REQUEST => {
                let body: GoogleTokenResponse = response.json().await?;
                return Ok(match body {
                    GoogleTokenResponse::Error { error, .. } => match error.as_str() {
                        "authorization_pending" => ProviderAuthorization::Pending,
                        "slow_down" => ProviderAuthorization::SlowDown(5),
                        "access_denied" => ProviderAuthorization::Denied,
                        "expired_token" => ProviderAuthorization::Expired,
                        _ => ProviderAuthorization::Denied,
                    },
                    GoogleTokenResponse::Success { .. } => ProviderAuthorization::Denied,
                });
            }
            StatusCode::PRECONDITION_REQUIRED => {
                return Ok(ProviderAuthorization::SlowDown(5));
            }
            StatusCode::FORBIDDEN => {
                return Ok(ProviderAuthorization::Denied);
            }
            other if other.is_server_error() => {
                return Ok(ProviderAuthorization::Pending);
            }
            _ => {}
        }

        let body: GoogleTokenResponse = response.error_for_status()?.json().await?;
        match body {
            GoogleTokenResponse::Success {
                access_token,
                token_type,
                scope,
                expires_in,
            } => {
                let scopes = scope
                    .unwrap_or_default()
                    .split_whitespace()
                    .filter_map(|value| {
                        let trimmed = value.trim();
                        (!trimmed.is_empty()).then_some(trimmed.to_string())
                    })
                    .collect();

                Ok(ProviderAuthorization::Authorized(DeviceAccessGrant {
                    access_token: SecretString::new(access_token.into()),
                    token_type,
                    scopes,
                    expires_in: expires_in.map(Duration::seconds),
                }))
            }
            GoogleTokenResponse::Error { error, .. } => match error.as_str() {
                "authorization_pending" => Ok(ProviderAuthorization::Pending),
                "slow_down" => Ok(ProviderAuthorization::SlowDown(5)),
                "access_denied" => Ok(ProviderAuthorization::Denied),
                "expired_token" => Ok(ProviderAuthorization::Expired),
                _ => Ok(ProviderAuthorization::Denied),
            },
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
