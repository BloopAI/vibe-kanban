use std::sync::Arc;

use anyhow::Error as AnyhowError;
use axum::http::{HeaderName, header::ACCEPT};
use octocrab::{
    OctocrabBuilder,
    auth::{DeviceCodes, OAuth},
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
    #[error("Invalid access token!")]
    InvalidAccessToken,
    #[error("Device flow not started")]
    DeviceFlowNotStarted,
    #[error("Device flow pending")]
    Pending,
    #[error(transparent)]
    Other(#[from] AnyhowError),
}

#[derive(Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DeviceFlowStartResponse {
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
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
            expires_in: device_codes.expires_in,
            interval: device_codes.interval,
        })
    }

    pub async fn device_poll(&self) -> Result<UserInfo, AuthError> {
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
        let poll_response = device_codes
            .poll_once(&client, &SecretString::from(self.client_id.clone()))
            .await?;
        let access_token = poll_response.either(
            |OAuth { access_token, .. }| Ok(access_token),
            |_| {
                // Polling continues
                Err(AuthError::Pending)
            },
        )?;
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

    pub async fn check_token(&self, token: Option<&str>) -> Result<(), AuthError> {
        let token = token.ok_or_else(|| AuthError::InvalidAccessToken)?;
        let client = OctocrabBuilder::new()
            .add_header(
                HeaderName::try_from("User-Agent").unwrap(),
                "vibe-kanban-app".to_string(),
            )
            .personal_token(token.to_string())
            .build()?;
        let res = client.current().user().await;
        match res {
            Ok(_) => Ok(()),
            Err(_) => Err(AuthError::InvalidAccessToken),
        }
    }
}
