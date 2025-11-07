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
pub struct ProviderUser {
    pub id: i64,
    pub login: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug)]
pub enum DevicePoll {
    Pending,
    SlowDown(u64),
    Denied,
    Expired,
    Authorized(DeviceAccessGrant),
}

#[async_trait]
pub trait DeviceAuthorizationProvider: Send + Sync + 'static {
    fn name(&self) -> &'static str;

    async fn request_device_code(&self, scopes: &[&str]) -> Result<DeviceCodeResponse>;

    async fn poll_device_code(&self, device_code: &str) -> Result<DevicePoll>;

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

    async fn poll_device_code(&self, device_code: &str) -> Result<DevicePoll> {
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
                    "authorization_pending" => DevicePoll::Pending,
                    "slow_down" => DevicePoll::SlowDown(5),
                    "access_denied" => DevicePoll::Denied,
                    "expired_token" => DevicePoll::Expired,
                    _ => DevicePoll::Denied,
                },
                GitHubTokenResponse::Success { .. } => DevicePoll::Denied,
            });
        }

        let body: GitHubTokenResponse = response.error_for_status()?.json().await?;
        match body {
            GitHubTokenResponse::Success {
                access_token,
                token_type,
                scope,
                expires_in,
            } => {
                let scopes = scope
                    .unwrap_or_default()
                    .split(',')
                    .filter(|value| !value.trim().is_empty())
                    .map(|value| value.trim().to_string())
                    .collect::<Vec<String>>();

                Ok(DevicePoll::Authorized(DeviceAccessGrant {
                    access_token: SecretString::new(access_token.into()),
                    token_type,
                    scopes,
                    expires_in: expires_in.map(Duration::seconds),
                }))
            }
            GitHubTokenResponse::Error { error, .. } => match error.as_str() {
                "authorization_pending" => Ok(DevicePoll::Pending),
                "slow_down" => Ok(DevicePoll::SlowDown(5)),
                "access_denied" => Ok(DevicePoll::Denied),
                "expired_token" => Ok(DevicePoll::Expired),
                _ => Ok(DevicePoll::Denied),
            },
        }
    }

    async fn fetch_user(&self, access_token: &SecretString) -> Result<ProviderUser> {
        let bearer = format!("Bearer {}", access_token.expose_secret());

        let user: GitHubUser = self
            .client
            .get("https://api.github.com/user")
            .header("Accept", "application/vnd.github+json")
            .header("Authorization", bearer.clone())
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;

        let email = if user.email.is_some() {
            user.email
        } else {
            let request = self
                .client
                .get("https://api.github.com/user/emails")
                .header("Accept", "application/vnd.github+json")
                .header("Authorization", bearer)
                .send()
                .await?;

            if request.status() == StatusCode::FORBIDDEN {
                None
            } else {
                let emails: Vec<GitHubEmail> = request
                    .error_for_status()?
                    .json()
                    .await
                    .context("failed to parse GitHub email response")?;

                emails
                    .into_iter()
                    .find(|entry| entry.primary && entry.verified)
                    .map(|entry| entry.email)
            }
        };

        Ok(ProviderUser {
            id: user.id,
            login: user.login,
            email,
            name: user.name,
            avatar_url: user.avatar_url,
        })
    }
}
