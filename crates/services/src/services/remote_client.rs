//! OAuth client for authorization-code handoffs with automatic retries.

use std::time::Duration;

use backon::{ExponentialBuilder, Retryable};
use remote::{
    activity::ActivityResponse,
    routes::tasks::{
        AssignSharedTaskRequest, BulkSharedTasksResponse, CreateSharedTaskRequest,
        DeleteSharedTaskRequest, SharedTaskResponse, UpdateSharedTaskRequest,
    },
};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
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
        ListOrganizationsResponse, Organization, RevokeInvitationRequest, UpdateMemberRoleRequest,
        UpdateMemberRoleResponse, UpdateOrganizationRequest,
    },
    projects::{ListProjectsResponse, RemoteProject},
};
use uuid::Uuid;

use super::auth::AuthContext;

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
pub struct RemoteClient {
    base: Url,
    http: Client,
    auth_context: AuthContext,
}

impl std::fmt::Debug for RemoteClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RemoteClient")
            .field("base", &self.base)
            .field("http", &self.http)
            .field("auth_context", &"<present>")
            .finish()
    }
}

impl Clone for RemoteClient {
    fn clone(&self) -> Self {
        Self {
            base: self.base.clone(),
            http: self.http.clone(),
            auth_context: self.auth_context.clone(),
        }
    }
}

impl RemoteClient {
    const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

    pub fn new(base_url: &str, auth_context: AuthContext) -> Result<Self, RemoteClientError> {
        let base = Url::parse(base_url).map_err(|e| RemoteClientError::Url(e.to_string()))?;
        let http = Client::builder()
            .timeout(Self::REQUEST_TIMEOUT)
            .user_agent(concat!("remote-client/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| RemoteClientError::Transport(e.to_string()))?;
        Ok(Self {
            base,
            http,
            auth_context,
        })
    }

    /// Returns the token if available.
    async fn require_token(&self) -> Result<String, RemoteClientError> {
        let creds = self
            .auth_context
            .get_credentials()
            .await
            .ok_or(RemoteClientError::Auth)?;
        Ok(creds.access_token)
    }

    /// Returns the base URL for the client.
    pub fn base_url(&self) -> &str {
        self.base.as_str()
    }

    /// Initiates an authorization-code handoff for the given provider.
    pub async fn handoff_init(
        &self,
        request: &HandoffInitRequest,
    ) -> Result<HandoffInitResponse, RemoteClientError> {
        self.post_public("/v1/oauth/web/init", Some(request))
            .await
            .map_err(|e| self.map_api_error(e))
    }

    /// Redeems an application code for an access token.
    pub async fn handoff_redeem(
        &self,
        request: &HandoffRedeemRequest,
    ) -> Result<HandoffRedeemResponse, RemoteClientError> {
        self.post_public("/v1/oauth/web/redeem", Some(request))
            .await
            .map_err(|e| self.map_api_error(e))
    }

    /// Gets an invitation by token (public, no auth required).
    pub async fn get_invitation(
        &self,
        invitation_token: &str,
    ) -> Result<GetInvitationResponse, RemoteClientError> {
        self.get_public(&format!("/v1/invitations/{invitation_token}"))
            .await
    }

    async fn send<B>(
        &self,
        method: reqwest::Method,
        path: &str,
        token: Option<&str>,
        body: Option<&B>,
    ) -> Result<reqwest::Response, RemoteClientError>
    where
        B: Serialize,
    {
        let url = self
            .base
            .join(path)
            .map_err(|e| RemoteClientError::Url(e.to_string()))?;

        (|| async {
            let mut req = self.http.request(method.clone(), url.clone());

            if let Some(t) = token {
                req = req.bearer_auth(t);
            }

            if let Some(b) = body {
                req = req.json(b);
            }

            let res = req.send().await.map_err(map_reqwest_error)?;

            match res.status() {
                s if s.is_success() => Ok(res),
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

    // Public endpoint helpers (no auth required)
    async fn get_public<T>(&self, path: &str) -> Result<T, RemoteClientError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let res = self
            .send(reqwest::Method::GET, path, None, None::<&()>)
            .await?;
        res.json::<T>()
            .await
            .map_err(|e| RemoteClientError::Serde(e.to_string()))
    }

    async fn post_public<T, B>(&self, path: &str, body: Option<&B>) -> Result<T, RemoteClientError>
    where
        T: for<'de> Deserialize<'de>,
        B: Serialize,
    {
        let res = self.send(reqwest::Method::POST, path, None, body).await?;
        res.json::<T>()
            .await
            .map_err(|e| RemoteClientError::Serde(e.to_string()))
    }

    // Authenticated endpoint helpers (require token)
    async fn get_authed<T>(&self, path: &str) -> Result<T, RemoteClientError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let token = self.require_token().await?;
        let res = self
            .send(reqwest::Method::GET, path, Some(&token), None::<&()>)
            .await?;
        res.json::<T>()
            .await
            .map_err(|e| RemoteClientError::Serde(e.to_string()))
    }

    async fn post_authed<T, B>(&self, path: &str, body: Option<&B>) -> Result<T, RemoteClientError>
    where
        T: for<'de> Deserialize<'de>,
        B: Serialize,
    {
        let token = self.require_token().await?;
        let res = self
            .send(reqwest::Method::POST, path, Some(&token), body)
            .await?;
        res.json::<T>()
            .await
            .map_err(|e| RemoteClientError::Serde(e.to_string()))
    }

    async fn patch_authed<T, B>(&self, path: &str, body: &B) -> Result<T, RemoteClientError>
    where
        T: for<'de> Deserialize<'de>,
        B: Serialize,
    {
        let token = self.require_token().await?;
        let res = self
            .send(reqwest::Method::PATCH, path, Some(&token), Some(body))
            .await?;
        res.json::<T>()
            .await
            .map_err(|e| RemoteClientError::Serde(e.to_string()))
    }

    async fn delete_authed(&self, path: &str) -> Result<(), RemoteClientError> {
        let token = self.require_token().await?;
        self.send(reqwest::Method::DELETE, path, Some(&token), None::<&()>)
            .await?;
        Ok(())
    }

    fn map_api_error(&self, err: RemoteClientError) -> RemoteClientError {
        if let RemoteClientError::Http { body, .. } = &err
            && let Ok(api_err) = serde_json::from_str::<ApiErrorResponse>(body)
        {
            return RemoteClientError::Api(map_error_code(Some(&api_err.error)));
        }
        err
    }

    /// Fetches user profile.
    pub async fn profile(&self) -> Result<ProfileResponse, RemoteClientError> {
        self.get_authed("/v1/profile").await
    }

    /// Revokes the session associated with the token.
    pub async fn logout(&self) -> Result<(), RemoteClientError> {
        self.delete_authed("/v1/oauth/logout").await
    }

    /// Lists organizations for the authenticated user.
    pub async fn list_organizations(&self) -> Result<ListOrganizationsResponse, RemoteClientError> {
        self.get_authed("/v1/organizations").await
    }

    /// Lists projects for a given organization.
    pub async fn list_projects(
        &self,
        organization_id: Uuid,
    ) -> Result<ListProjectsResponse, RemoteClientError> {
        self.get_authed(&format!("/v1/projects?organization_id={organization_id}"))
            .await
    }

    pub async fn get_project(&self, project_id: Uuid) -> Result<RemoteProject, RemoteClientError> {
        self.get_authed(&format!("/v1/projects/{project_id}")).await
    }

    pub async fn create_project(
        &self,
        request: &CreateRemoteProjectPayload,
    ) -> Result<RemoteProject, RemoteClientError> {
        self.post_authed("/v1/projects", Some(request)).await
    }

    /// Gets a specific organization by ID.
    pub async fn get_organization(
        &self,
        org_id: Uuid,
    ) -> Result<GetOrganizationResponse, RemoteClientError> {
        self.get_authed(&format!("/v1/organizations/{org_id}"))
            .await
    }

    /// Creates a new organization.
    pub async fn create_organization(
        &self,
        request: &CreateOrganizationRequest,
    ) -> Result<CreateOrganizationResponse, RemoteClientError> {
        self.post_authed("/v1/organizations", Some(request)).await
    }

    /// Updates an organization's name.
    pub async fn update_organization(
        &self,
        org_id: Uuid,
        request: &UpdateOrganizationRequest,
    ) -> Result<Organization, RemoteClientError> {
        self.patch_authed(&format!("/v1/organizations/{org_id}"), request)
            .await
    }

    /// Deletes an organization.
    pub async fn delete_organization(&self, org_id: Uuid) -> Result<(), RemoteClientError> {
        self.delete_authed(&format!("/v1/organizations/{org_id}"))
            .await
    }

    /// Creates an invitation to an organization.
    pub async fn create_invitation(
        &self,
        org_id: Uuid,
        request: &CreateInvitationRequest,
    ) -> Result<CreateInvitationResponse, RemoteClientError> {
        self.post_authed(
            &format!("/v1/organizations/{org_id}/invitations"),
            Some(request),
        )
        .await
    }

    /// Lists invitations for an organization.
    pub async fn list_invitations(
        &self,
        org_id: Uuid,
    ) -> Result<ListInvitationsResponse, RemoteClientError> {
        self.get_authed(&format!("/v1/organizations/{org_id}/invitations"))
            .await
    }

    pub async fn revoke_invitation(
        &self,
        org_id: Uuid,
        invitation_id: Uuid,
    ) -> Result<(), RemoteClientError> {
        let body = RevokeInvitationRequest { invitation_id };
        self.post_authed(
            &format!("/v1/organizations/{org_id}/invitations/revoke"),
            Some(&body),
        )
        .await
    }

    /// Accepts an invitation.
    pub async fn accept_invitation(
        &self,
        invitation_token: &str,
    ) -> Result<AcceptInvitationResponse, RemoteClientError> {
        self.post_authed(
            &format!("/v1/invitations/{invitation_token}/accept"),
            None::<&()>,
        )
        .await
    }

    /// Lists members of an organization.
    pub async fn list_members(
        &self,
        org_id: Uuid,
    ) -> Result<ListMembersResponse, RemoteClientError> {
        self.get_authed(&format!("/v1/organizations/{org_id}/members"))
            .await
    }

    /// Removes a member from an organization.
    pub async fn remove_member(
        &self,
        org_id: Uuid,
        user_id: Uuid,
    ) -> Result<(), RemoteClientError> {
        self.delete_authed(&format!("/v1/organizations/{org_id}/members/{user_id}"))
            .await
    }

    /// Updates a member's role in an organization.
    pub async fn update_member_role(
        &self,
        org_id: Uuid,
        user_id: Uuid,
        request: &UpdateMemberRoleRequest,
    ) -> Result<UpdateMemberRoleResponse, RemoteClientError> {
        self.patch_authed(
            &format!("/v1/organizations/{org_id}/members/{user_id}/role"),
            request,
        )
        .await
    }

    /// Creates a shared task.
    pub async fn create_shared_task(
        &self,
        request: &CreateSharedTaskRequest,
    ) -> Result<SharedTaskResponse, RemoteClientError> {
        self.post_authed("/v1/tasks", Some(request)).await
    }

    /// Updates a shared task.
    pub async fn update_shared_task(
        &self,
        task_id: Uuid,
        request: &UpdateSharedTaskRequest,
    ) -> Result<SharedTaskResponse, RemoteClientError> {
        self.patch_authed(&format!("/v1/tasks/{task_id}"), request)
            .await
    }

    /// Assigns a shared task to a user.
    pub async fn assign_shared_task(
        &self,
        task_id: Uuid,
        request: &AssignSharedTaskRequest,
    ) -> Result<SharedTaskResponse, RemoteClientError> {
        self.post_authed(&format!("/v1/tasks/{task_id}/assign"), Some(request))
            .await
    }

    /// Deletes a shared task.
    pub async fn delete_shared_task(
        &self,
        task_id: Uuid,
        request: &DeleteSharedTaskRequest,
    ) -> Result<SharedTaskResponse, RemoteClientError> {
        let token = self.require_token().await?;
        let res = self
            .send(
                reqwest::Method::DELETE,
                &format!("/v1/tasks/{task_id}"),
                Some(&token),
                Some(request),
            )
            .await?;
        res.json::<SharedTaskResponse>()
            .await
            .map_err(|e| RemoteClientError::Serde(e.to_string()))
    }

    /// Fetches activity events for a project.
    pub async fn fetch_activity(
        &self,
        project_id: Uuid,
        after: Option<i64>,
        limit: u32,
    ) -> Result<ActivityResponse, RemoteClientError> {
        let mut path = format!("/v1/activity?project_id={project_id}&limit={limit}");
        if let Some(seq) = after {
            path.push_str(&format!("&after={seq}"));
        }
        self.get_authed(&path).await
    }

    /// Fetches bulk snapshot of shared tasks for a project.
    pub async fn fetch_bulk_snapshot(
        &self,
        project_id: Uuid,
    ) -> Result<BulkSharedTasksResponse, RemoteClientError> {
        self.get_authed(&format!("/v1/tasks/bulk?project_id={project_id}"))
            .await
    }
}

#[derive(Debug, Serialize)]
pub struct CreateRemoteProjectPayload {
    pub organization_id: Uuid,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

fn map_reqwest_error(e: reqwest::Error) -> RemoteClientError {
    if e.is_timeout() {
        RemoteClientError::Timeout
    } else {
        RemoteClientError::Transport(e.to_string())
    }
}
