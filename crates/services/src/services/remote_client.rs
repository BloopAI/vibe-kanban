//! OAuth client for authorization-code handoffs with automatic retries.

use std::time::Duration;

use backon::{ExponentialBuilder, Retryable};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::warn;
use url::Url;
use utils::api::{
    oauth::{
        HandoffInitRequest, HandoffInitResponse, HandoffRedeemRequest, HandoffRedeemResponse,
        ProfileResponse,
    },
    organizations::{
        AcceptInvitationResponse, CreateInvitationRequest, CreateInvitationResponse,
        CreateOrganizationRequest, CreateOrganizationResponse, GetInvitationResponse,
        GetOrganizationResponse, ListInvitationsResponse, ListMembersResponse,
        ListOrganizationsResponse, Organization, UpdateMemberRoleRequest, UpdateMemberRoleResponse,
        UpdateOrganizationRequest,
    },
};
use uuid::Uuid;

#[derive(Debug, Clone, Error)]
pub enum RemoteClientError {
    #[error("network error: {0}")]
    Transport(String),
    #[error("timeout")]
    Timeout,
    #[error("http {status}: {body}")]
    Http { status: u16, body: String },
    #[error("api error: {0:?}")]
    Api(HandoffErrorCode),
    #[error("unauthorized")]
    Auth,
    #[error("json error: {0}")]
    Serde(String),
    #[error("url error: {0}")]
    Url(String),
}

impl RemoteClientError {
    /// Returns true if the error is transient and should be retried.
    pub fn should_retry(&self) -> bool {
        match self {
            Self::Transport(_) | Self::Timeout => true,
            Self::Http { status, .. } => (500..=599).contains(status),
            _ => false,
        }
    }
}

#[derive(Debug, Clone)]
pub enum HandoffErrorCode {
    UnsupportedProvider,
    InvalidReturnUrl,
    InvalidChallenge,
    ProviderError,
    NotFound,
    Expired,
    AccessDenied,
    InternalError,
    Other(String),
}

fn map_error_code(code: Option<&str>) -> HandoffErrorCode {
    match code.unwrap_or("internal_error") {
        "unsupported_provider" => HandoffErrorCode::UnsupportedProvider,
        "invalid_return_url" => HandoffErrorCode::InvalidReturnUrl,
        "invalid_challenge" => HandoffErrorCode::InvalidChallenge,
        "provider_error" => HandoffErrorCode::ProviderError,
        "not_found" => HandoffErrorCode::NotFound,
        "expired" | "expired_token" => HandoffErrorCode::Expired,
        "access_denied" => HandoffErrorCode::AccessDenied,
        "internal_error" => HandoffErrorCode::InternalError,
        other => HandoffErrorCode::Other(other.to_string()),
    }
}

#[derive(Deserialize)]
struct ApiErrorResponse {
    error: String,
}

/// HTTP client for the remote OAuth server with automatic retries.
#[derive(Debug, Clone)]
pub struct RemoteClient {
    base: Url,
    http: Client,
}

impl RemoteClient {
    pub fn new(base_url: &str) -> Result<Self, RemoteClientError> {
        let base = Url::parse(base_url).map_err(|e| RemoteClientError::Url(e.to_string()))?;
        let http = Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent(concat!("remote-client/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| RemoteClientError::Transport(e.to_string()))?;
        Ok(Self { base, http })
    }

    /// Initiates an authorization-code handoff for the given provider.
    pub async fn handoff_init(
        &self,
        request: &HandoffInitRequest,
    ) -> Result<HandoffInitResponse, RemoteClientError> {
        self.post_json("/oauth/web/init", request)
            .await
            .map_err(|e| self.map_api_error(e))
    }

    /// Redeems an application code for an access token.
    pub async fn handoff_redeem(
        &self,
        request: &HandoffRedeemRequest,
    ) -> Result<HandoffRedeemResponse, RemoteClientError> {
        self.post_json("/oauth/web/redeem", request)
            .await
            .map_err(|e| self.map_api_error(e))
    }

    /// Fetches user profile using an access token.
    pub async fn profile(&self, token: &str) -> Result<ProfileResponse, RemoteClientError> {
        self.get_json("/v1/profile", Some(token)).await
    }

    /// Lists organizations for the authenticated user.
    pub async fn list_organizations(
        &self,
        token: &str,
    ) -> Result<ListOrganizationsResponse, RemoteClientError> {
        self.get_json("/v1/organizations", Some(token)).await
    }

    /// Gets a specific organization by ID.
    pub async fn get_organization(
        &self,
        token: &str,
        org_id: Uuid,
    ) -> Result<GetOrganizationResponse, RemoteClientError> {
        self.get_json(&format!("/v1/organizations/{org_id}"), Some(token))
            .await
    }

    /// Creates a new organization.
    pub async fn create_organization(
        &self,
        token: &str,
        request: &CreateOrganizationRequest,
    ) -> Result<CreateOrganizationResponse, RemoteClientError> {
        self.post_json_with_auth("/v1/organizations", request, token)
            .await
    }

    /// Updates an organization's name.
    pub async fn update_organization(
        &self,
        token: &str,
        org_id: Uuid,
        request: &UpdateOrganizationRequest,
    ) -> Result<Organization, RemoteClientError> {
        self.patch_json(&format!("/v1/organizations/{org_id}"), request, token)
            .await
    }

    /// Deletes an organization.
    pub async fn delete_organization(
        &self,
        token: &str,
        org_id: Uuid,
    ) -> Result<(), RemoteClientError> {
        self.delete(&format!("/v1/organizations/{org_id}"), token)
            .await
    }

    /// Creates an invitation to an organization.
    pub async fn create_invitation(
        &self,
        token: &str,
        org_id: Uuid,
        request: &CreateInvitationRequest,
    ) -> Result<CreateInvitationResponse, RemoteClientError> {
        self.post_json_with_auth(
            &format!("/v1/organizations/{org_id}/invitations"),
            request,
            token,
        )
        .await
    }

    /// Lists invitations for an organization.
    pub async fn list_invitations(
        &self,
        token: &str,
        org_id: Uuid,
    ) -> Result<ListInvitationsResponse, RemoteClientError> {
        self.get_json(&format!("/v1/organizations/{org_id}/invitations"), Some(token))
            .await
    }

    /// Gets an invitation by token (public, no auth required).
    pub async fn get_invitation(
        &self,
        invitation_token: &str,
    ) -> Result<GetInvitationResponse, RemoteClientError> {
        self.get_json(&format!("/v1/invitations/{invitation_token}"), None)
            .await
    }

    /// Accepts an invitation.
    pub async fn accept_invitation(
        &self,
        token: &str,
        invitation_token: &str,
    ) -> Result<AcceptInvitationResponse, RemoteClientError> {
        self.post_json_with_auth(
            &format!("/v1/invitations/{invitation_token}/accept"),
            &serde_json::json!({}),
            token,
        )
        .await
    }

    /// Lists members of an organization.
    pub async fn list_members(
        &self,
        token: &str,
        org_id: Uuid,
    ) -> Result<ListMembersResponse, RemoteClientError> {
        self.get_json(&format!("/v1/organizations/{org_id}/members"), Some(token))
            .await
    }

    /// Removes a member from an organization.
    pub async fn remove_member(
        &self,
        token: &str,
        org_id: Uuid,
        user_id: Uuid,
    ) -> Result<(), RemoteClientError> {
        self.delete(&format!("/v1/organizations/{org_id}/members/{user_id}"), token)
            .await
    }

    /// Updates a member's role in an organization.
    pub async fn update_member_role(
        &self,
        token: &str,
        org_id: Uuid,
        user_id: Uuid,
        request: &UpdateMemberRoleRequest,
    ) -> Result<UpdateMemberRoleResponse, RemoteClientError> {
        self.patch_json(
            &format!("/v1/organizations/{org_id}/members/{user_id}/role"),
            request,
            token,
        )
        .await
    }

    async fn post_json_with_auth<T, B>(
        &self,
        path: &str,
        body: &B,
        token: &str,
    ) -> Result<T, RemoteClientError>
    where
        T: for<'de> Deserialize<'de>,
        B: Serialize,
    {
        let url = self
            .base
            .join(path)
            .map_err(|e| RemoteClientError::Url(e.to_string()))?;

        (|| async {
            let res = self
                .http
                .post(url.clone())
                .bearer_auth(token)
                .json(body)
                .send()
                .await
                .map_err(map_reqwest_error)?;

            match res.status() {
                s if s.is_success() => res
                    .json::<T>()
                    .await
                    .map_err(|e| RemoteClientError::Serde(e.to_string())),
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(RemoteClientError::Auth),
                s => {
                    let status = s.as_u16();
                    let body = res.text().await.unwrap_or_default();
                    Err(RemoteClientError::Http { status, body })
                }
            }
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &RemoteClientError| e.should_retry())
        .notify(|e, dur| {
            warn!(
                "Remote call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                e
            )
        })
        .await
    }

    async fn patch_json<T, B>(
        &self,
        path: &str,
        body: &B,
        token: &str,
    ) -> Result<T, RemoteClientError>
    where
        T: for<'de> Deserialize<'de>,
        B: Serialize,
    {
        let url = self
            .base
            .join(path)
            .map_err(|e| RemoteClientError::Url(e.to_string()))?;

        (|| async {
            let res = self
                .http
                .patch(url.clone())
                .bearer_auth(token)
                .json(body)
                .send()
                .await
                .map_err(map_reqwest_error)?;

            match res.status() {
                StatusCode::OK => res
                    .json::<T>()
                    .await
                    .map_err(|e| RemoteClientError::Serde(e.to_string())),
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(RemoteClientError::Auth),
                s => {
                    let status = s.as_u16();
                    let body = res.text().await.unwrap_or_default();
                    Err(RemoteClientError::Http { status, body })
                }
            }
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &RemoteClientError| e.should_retry())
        .notify(|e, dur| {
            warn!(
                "Remote call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                e
            )
        })
        .await
    }

    async fn delete(&self, path: &str, token: &str) -> Result<(), RemoteClientError> {
        let url = self
            .base
            .join(path)
            .map_err(|e| RemoteClientError::Url(e.to_string()))?;

        (|| async {
            let res = self
                .http
                .delete(url.clone())
                .bearer_auth(token)
                .send()
                .await
                .map_err(map_reqwest_error)?;

            match res.status() {
                StatusCode::NO_CONTENT | StatusCode::OK => Ok(()),
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(RemoteClientError::Auth),
                s => {
                    let status = s.as_u16();
                    let body = res.text().await.unwrap_or_default();
                    Err(RemoteClientError::Http { status, body })
                }
            }
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &RemoteClientError| e.should_retry())
        .notify(|e, dur| {
            warn!(
                "Remote call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                e
            )
        })
        .await
    }

    async fn post_json<T, B>(&self, path: &str, body: &B) -> Result<T, RemoteClientError>
    where
        T: for<'de> Deserialize<'de>,
        B: Serialize,
    {
        let url = self
            .base
            .join(path)
            .map_err(|e| RemoteClientError::Url(e.to_string()))?;

        (|| async {
            let res = self
                .http
                .post(url.clone())
                .json(body)
                .send()
                .await
                .map_err(map_reqwest_error)?;

            if !res.status().is_success() {
                let status = res.status().as_u16();
                let body = res.text().await.unwrap_or_default();
                return Err(RemoteClientError::Http { status, body });
            }

            res.json::<T>()
                .await
                .map_err(|e| RemoteClientError::Serde(e.to_string()))
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &RemoteClientError| e.should_retry())
        .notify(|e, dur| {
            warn!(
                "Remote call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                e
            )
        })
        .await
    }

    async fn get_json<T>(&self, path: &str, auth: Option<&str>) -> Result<T, RemoteClientError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let url = self
            .base
            .join(path)
            .map_err(|e| RemoteClientError::Url(e.to_string()))?;

        (|| async {
            let mut req = self.http.get(url.clone());
            if let Some(token) = auth {
                req = req.bearer_auth(token);
            }

            let res = req.send().await.map_err(map_reqwest_error)?;

            match res.status() {
                StatusCode::OK => res
                    .json::<T>()
                    .await
                    .map_err(|e| RemoteClientError::Serde(e.to_string())),
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(RemoteClientError::Auth),
                s if s.is_server_error() => {
                    let status = s.as_u16();
                    let body = res.text().await.unwrap_or_default();
                    Err(RemoteClientError::Http { status, body })
                }
                s => {
                    let status = s.as_u16();
                    let body = res.text().await.unwrap_or_default();
                    Err(RemoteClientError::Http { status, body })
                }
            }
        })
        .retry(
            &ExponentialBuilder::default()
                .with_min_delay(Duration::from_secs(1))
                .with_max_delay(Duration::from_secs(30))
                .with_max_times(3)
                .with_jitter(),
        )
        .when(|e: &RemoteClientError| e.should_retry())
        .notify(|e, dur| {
            warn!(
                "Remote call failed, retrying after {:.2}s: {}",
                dur.as_secs_f64(),
                e
            )
        })
        .await
    }

    fn map_api_error(&self, err: RemoteClientError) -> RemoteClientError {
        if let RemoteClientError::Http { body, .. } = &err
            && let Ok(api_err) = serde_json::from_str::<ApiErrorResponse>(body)
        {
            return RemoteClientError::Api(map_error_code(Some(&api_err.error)));
        }
        err
    }
}

fn map_reqwest_error(e: reqwest::Error) -> RemoteClientError {
    if e.is_timeout() {
        RemoteClientError::Timeout
    } else {
        RemoteClientError::Transport(e.to_string())
    }
}
