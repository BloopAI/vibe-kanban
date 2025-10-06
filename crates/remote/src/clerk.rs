use std::time::Duration;

use reqwest::{Client, StatusCode, Url};
use secrecy::ExposeSecret;
use serde::Deserialize;
use thiserror::Error;

use crate::config::ClerkConfig;

#[derive(Debug, Clone)]
pub struct ClerkService {
    client: Client,
    api_url: Url,
    secret_key: String,
}

#[derive(Debug, Clone)]
pub struct ClerkOrganization {
    pub id: String,
    pub name: String,
    pub slug: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ClerkUser {
    pub id: String,
    pub email: String,
    pub display_name: String,
}

#[derive(Debug, Error)]
pub enum ClerkServiceError {
    #[error("resource `{0}` not found")]
    NotFound(String),
    #[error("unexpected response: {0}")]
    InvalidResponse(String),
    #[error(transparent)]
    Http(#[from] reqwest::Error),
}

impl ClerkService {
    pub fn new(config: &ClerkConfig) -> Result<Self, ClerkServiceError> {
        let client = Client::builder().timeout(Duration::from_secs(30)).build()?;

        Ok(Self {
            client,
            api_url: config.get_api_url().clone(),
            secret_key: config.get_secret_key().expose_secret().to_string().clone(),
        })
    }

    pub async fn get_organization(
        &self,
        organization_id: &str,
    ) -> Result<ClerkOrganization, ClerkServiceError> {
        let url = self.endpoint(&format!("organizations/{organization_id}"))?;
        let response = self
            .client
            .get(url)
            .bearer_auth(&self.secret_key)
            .send()
            .await?;

        if response.status() == StatusCode::NOT_FOUND {
            return Err(ClerkServiceError::NotFound(organization_id.to_string()));
        }

        let response = response.error_for_status()?;
        let body: OrganizationResponse = response.json().await?;
        Ok(body.into())
    }

    pub async fn get_user(&self, user_id: &str) -> Result<ClerkUser, ClerkServiceError> {
        let url = self.endpoint(&format!("users/{user_id}"))?;
        let response = self
            .client
            .get(url)
            .bearer_auth(&self.secret_key)
            .send()
            .await?;

        if response.status() == StatusCode::NOT_FOUND {
            return Err(ClerkServiceError::NotFound(user_id.to_string()));
        }

        let response = response.error_for_status()?;
        let body: UserResponse = response.json().await?;
        body.try_into()
    }

    fn endpoint(&self, path: &str) -> Result<Url, ClerkServiceError> {
        self.api_url
            .join(path)
            .map_err(|err| ClerkServiceError::InvalidResponse(err.to_string()))
    }
}

#[derive(Debug, Deserialize)]
struct OrganizationResponse {
    id: String,
    name: String,
    slug: Option<String>,
}

impl From<OrganizationResponse> for ClerkOrganization {
    fn from(value: OrganizationResponse) -> Self {
        Self {
            id: value.id,
            name: value.name,
            slug: value.slug,
        }
    }
}

#[derive(Debug, Deserialize)]
struct UserResponse {
    id: String,
    first_name: Option<String>,
    last_name: Option<String>,
    username: Option<String>,
    primary_email_address_id: Option<String>,
    email_addresses: Vec<UserEmailAddress>,
}

#[derive(Debug, Deserialize)]
struct UserEmailAddress {
    id: String,
    email_address: String,
}

impl TryFrom<UserResponse> for ClerkUser {
    type Error = ClerkServiceError;

    fn try_from(value: UserResponse) -> Result<Self, Self::Error> {
        let email = resolve_primary_email(&value.primary_email_address_id, &value.email_addresses)
            .ok_or_else(|| {
                ClerkServiceError::InvalidResponse(format!(
                    "user {} missing primary email address",
                    value.id
                ))
            })?;

        let display_name = value
            .username
            .or_else(|| compose_name(&value.first_name, &value.last_name))
            .unwrap_or_else(|| email.clone());

        Ok(Self {
            id: value.id,
            email,
            display_name,
        })
    }
}

fn resolve_primary_email(
    primary_id: &Option<String>,
    addresses: &[UserEmailAddress],
) -> Option<String> {
    if let Some(primary_id) = primary_id {
        if let Some(primary) = addresses.iter().find(|address| address.id == *primary_id) {
            return Some(primary.email_address.clone());
        }
    }

    addresses.first().map(|addr| addr.email_address.clone())
}

fn compose_name(first_name: &Option<String>, last_name: &Option<String>) -> Option<String> {
    match (first_name.as_deref(), last_name.as_deref()) {
        (Some(first), Some(last)) => Some(format!("{first} {last}")),
        (Some(first), None) => Some(first.to_string()),
        (None, Some(last)) => Some(last.to_string()),
        (None, None) => None,
    }
}
