use std::sync::Arc;

use anyhow::Error as AnyhowError;
use axum::http::{HeaderName, header::ACCEPT};
use octocrab::{
    OctocrabBuilder,
    auth::{Continue, DeviceCodes, OAuth},
};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::RwLock;
use ts_rs::TS;

#[derive(Clone)]
pub struct AuthService {
    pub client_id: String,
    pub device_codes: Arc<RwLock<Option<DeviceCodes>>>,
}

#[derive(Debug, Error)]
pub enum AuthError {
    #[error(transparent)]
    GitHubClient(#[from] octocrab::Error),
    #[error(transparent)]
    Parse(#[from] serde_json::Error),
    #[error("Device flow not started")]
    DeviceFlowNotStarted,
    #[error("Device flow pending")]
    Pending(Continue),
    #[error("Access denied")]
    AccessDenied,
    #[error("Expired token")]
    ExpiredToken,
    #[error(transparent)]
    Other(#[from] AnyhowError),
}

#[derive(Serialize, Deserialize, TS)]
pub struct DeviceFlowStartResponse {
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u32,
    pub interval: u32,
}

pub struct UserInfo {
    pub username: String,
    pub primary_email: Option<String>,
    pub token: String,
}

#[derive(Deserialize)]
pub struct GitHubEmailEntry {
    pub email: String,
    pub primary: bool,
}

impl Default for AuthService {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Serialize)]
struct PollForDevice<'a> {
    /// Required. The client ID you received from GitHub for your OAuth App.
    client_id: &'a str,
    /// Required. The device verification code you received from the POST <https://github.com/login/device/code> request.
    device_code: &'a str,
    /// Required. The grant type must be urn:ietf:params:oauth:grant-type:device_code.
    grant_type: &'static str,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum TokenResponse {
    // We got the auth information.
    Ok(OAuth),
    // We got an error that allows us to continue polling.
    Continue { error: Continue },
    // We got an error and cannot continue
    Error { error: TokenResponseError },
}

#[derive(Deserialize, Debug, Clone, Copy)]
#[serde(rename_all = "snake_case")]
enum TokenResponseError {
    AccessDenied,
    ExpiredToken,
}

impl AuthService {
    pub fn new() -> Self {
        let client_id_str = option_env!("GITHUB_CLIENT_ID").unwrap_or("Ov23li9bxz3kKfPOIsGm");
        AuthService {
            client_id: client_id_str.to_string(),
            device_codes: Arc::new(RwLock::new(None)), // Initially no device codes
        }
    }

    pub async fn device_start(&self) -> Result<DeviceFlowStartResponse, AuthError> {
        let client = OctocrabBuilder::new()
            .base_uri("https://github.com")?
            .add_header(ACCEPT, "application/json".to_string())
            .build()?;
        let device_codes = client
            .authenticate_as_device(
                &SecretString::from(self.client_id.clone()),
                ["user:email", "repo"],
            )
            .await?;
        self.device_codes
            .write()
            .await
            .replace(device_codes.clone()); // Store the device codes for later polling
        Ok(DeviceFlowStartResponse {
            user_code: device_codes.user_code,
            verification_uri: device_codes.verification_uri,
            expires_in: device_codes.expires_in as u32,
            interval: device_codes.interval as u32,
        })
    }

    async fn get_oauth(&self) -> Result<OAuth, AuthError> {
        let device_codes = {
            let guard = self.device_codes.read().await;
            guard
                .as_ref()
                .ok_or(AuthError::DeviceFlowNotStarted)?
                .clone()
        };
        let client = OctocrabBuilder::new()
            .base_uri("https://github.com")?
            .add_header(ACCEPT, "application/json".to_string())
            .build()?;
        let poll_token_response: TokenResponse = client
            .post(
                "/login/oauth/access_token",
                Some(&PollForDevice {
                    client_id: &self.client_id,
                    device_code: &device_codes.device_code,
                    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                }),
            )
            .await?;

        match poll_token_response {
            TokenResponse::Ok(oauth) => Ok(oauth),
            TokenResponse::Continue { error } => Err(AuthError::Pending(error)),
            TokenResponse::Error { error } => Err(match error {
                TokenResponseError::AccessDenied => AuthError::AccessDenied,
                TokenResponseError::ExpiredToken => AuthError::ExpiredToken,
            }),
        }
    }

    async fn get_user_info(
        &self,
        access_token: &secrecy::SecretBox<str>,
    ) -> Result<UserInfo, AuthError> {
        let client = OctocrabBuilder::new()
            .add_header(
                HeaderName::try_from("User-Agent").unwrap(),
                "vibe-kanban-app".to_string(),
            )
            .personal_token(access_token.clone())
            .build()?;
        let user = client.current().user().await?;
        let emails: Vec<GitHubEmailEntry> = client.get("/user/emails", None::<&()>).await?;
        let primary_email = emails
            .iter()
            .find(|entry| entry.primary)
            .map(|entry| entry.email.clone());

        Ok(UserInfo {
            username: user.login,
            primary_email,
            token: access_token.expose_secret().to_string(),
        })
    }

    pub async fn device_poll(&self) -> Result<UserInfo, AuthError> {
        let access_token = self.get_oauth().await?.access_token;
        self.get_user_info(&access_token).await
    }
}
