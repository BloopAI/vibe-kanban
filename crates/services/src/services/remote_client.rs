//! OAuth client for authorization-code handoffs with automatic retries.

use std::time::Duration;

use api_types::{
    AcceptInvitationResponse, CreateInvitationRequest, CreateInvitationResponse,
    CreateIssueAssigneeRequest, CreateIssueRelationshipRequest, CreateIssueRequest,
    CreateIssueTagRequest, CreateOrganizationRequest, CreateOrganizationResponse,
    CreateWorkspaceRequest, DeleteResponse, DeleteWorkspaceRequest, GetInvitationResponse,
    GetOrganizationResponse, HandoffInitRequest, HandoffInitResponse, HandoffRedeemRequest,
    HandoffRedeemResponse, Issue, IssueAssignee, IssueRelationship, IssueTag,
    ListAttachmentsResponse, ListInvitationsResponse, ListIssueAssigneesResponse,
    ListIssueRelationshipsResponse, ListIssueTagsResponse, ListIssuesResponse, ListMembersResponse,
    ListOrganizationsResponse, ListProjectStatusesResponse, ListProjectsResponse,
    ListPullRequestsResponse, ListTagsResponse, MutationResponse, Organization, ProfileResponse,
    RevokeInvitationRequest, Tag, TokenRefreshRequest, TokenRefreshResponse, UpdateIssueRequest,
    UpdateMemberRoleRequest, UpdateMemberRoleResponse, UpdateOrganizationRequest,
    UpdateWorkspaceRequest, UpsertPullRequestRequest, Workspace,
};
use backon::{ExponentialBuilder, Retryable};
use chrono::Duration as ChronoDuration;
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::warn;
use url::Url;
use utils::jwt::extract_expiration;
use uuid::Uuid;

use super::{auth::AuthContext, oauth_credentials::Credentials};

#[derive(Debug, Clone, Error)]
pub enum RemoteClientError {
    #[error("network error: {0}")]
    Transport(String),
    #[error("timeout")]
    Timeout,
    #[error("token refresh timed out")]
    TokenRefreshTimeout,
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
    #[error("credentials storage error: {0}")]
    Storage(String),
    #[error("invalid access token: {0}")]
    Token(String),
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

#[derive(Debug, Clone, Copy)]
struct RequestTimeoutOptions {
    timeout: Duration,
    retry_on_timeout: bool,
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
    const TOKEN_REFRESH_REQUEST_TIMEOUT: Duration = Duration::from_mins(5);
    const TOKEN_REFRESH_LEEWAY_SECS: i64 = 20;

    pub fn new(base_url: &str, auth_context: AuthContext) -> Result<Self, RemoteClientError> {
        let base = Url::parse(base_url).map_err(|e| RemoteClientError::Url(e.to_string()))?;
        let mut builder = Client::builder()
            .timeout(Self::REQUEST_TIMEOUT)
            .user_agent(concat!("remote-client/", env!("CARGO_PKG_VERSION")));

        #[cfg(debug_assertions)]
        {
            builder = builder.danger_accept_invalid_certs(true);
        }

        let http = builder
            .build()
            .map_err(|e| RemoteClientError::Transport(e.to_string()))?;
        Ok(Self {
            base,
            http,
            auth_context,
        })
    }

    /// Returns a valid access token, refreshing when it's about to expire.
    fn require_token(
        &self,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<String, RemoteClientError>> + Send + '_>,
    > {
        Box::pin(async move {
            let leeway = ChronoDuration::seconds(Self::TOKEN_REFRESH_LEEWAY_SECS);
            let creds = self
                .auth_context
                .get_credentials()
                .await
                .ok_or(RemoteClientError::Auth)?;

            if let Some(token) = creds.access_token.as_ref()
                && !creds.expires_soon(leeway)
            {
                return Ok(token.clone());
            }

            let refreshed = {
                let _refresh_guard = self.auth_context.refresh_guard().await;
                let latest = self
                    .auth_context
                    .get_credentials()
                    .await
                    .ok_or(RemoteClientError::Auth)?;
                if let Some(token) = latest.access_token.as_ref()
                    && !latest.expires_soon(leeway)
                {
                    return Ok(token.clone());
                }

                self.refresh_credentials(&latest).await
            };

            match refreshed {
                Ok(updated) => updated.access_token.ok_or(RemoteClientError::Auth),
                Err(RemoteClientError::Auth) => {
                    let _ = self.auth_context.clear_credentials().await;
                    Err(RemoteClientError::Auth)
                }
                Err(RemoteClientError::TokenRefreshTimeout) => {
                    tracing::error!(
                        "Refresh token request timed out after {} minutes. Discarding the refresh token and forcing re-login.",
                        Self::TOKEN_REFRESH_REQUEST_TIMEOUT.as_secs() / 60
                    );
                    let _ = self.auth_context.clear_credentials().await;
                    Err(RemoteClientError::TokenRefreshTimeout)
                }
                Err(err) => Err(err),
            }
        })
    }

    async fn refresh_credentials(
        &self,
        creds: &Credentials,
    ) -> Result<Credentials, RemoteClientError> {
        let response = self.refresh_token_request(&creds.refresh_token).await?;
        let access_token = response.access_token;
        let refresh_token = response.refresh_token;
        let expires_at = extract_expiration(&access_token)
            .map_err(|err| RemoteClientError::Token(err.to_string()))?;
        let new_creds = Credentials {
            access_token: Some(access_token),
            refresh_token,
            expires_at: Some(expires_at),
        };
        self.auth_context
            .save_credentials(&new_creds)
            .await
            .map_err(|e| RemoteClientError::Storage(e.to_string()))?;
        Ok(new_creds)
    }

    async fn refresh_token_request(
        &self,
        refresh_token: &str,
    ) -> Result<TokenRefreshResponse, RemoteClientError> {
        let request = TokenRefreshRequest {
            refresh_token: refresh_token.to_string(),
        };

        let timeout_options = RequestTimeoutOptions {
            timeout: Self::TOKEN_REFRESH_REQUEST_TIMEOUT,
            retry_on_timeout: false,
        };

        self.post_public_with_timeout_options("/v1/tokens/refresh", Some(&request), timeout_options)
            .await
            .map_err(|e| {
                if matches!(e, RemoteClientError::Timeout) {
                    RemoteClientError::TokenRefreshTimeout
                } else {
                    e
                }
            })
            .map_err(|e| self.map_api_error(e))
    }

    /// Returns the base URL for the client.
    pub fn base_url(&self) -> &str {
        self.base.as_str()
    }

    /// Returns a valid access token for use-cases like maintaining a websocket connection.
    pub async fn access_token(&self) -> Result<String, RemoteClientError> {
        self.require_token().await
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
        requires_auth: bool,
        body: Option<&B>,
    ) -> Result<reqwest::Response, RemoteClientError>
    where
        B: Serialize,
    {
        self.send_internal(method, path, requires_auth, body, None)
            .await
    }

    async fn send_internal<B>(
        &self,
        method: reqwest::Method,
        path: &str,
        requires_auth: bool,
        body: Option<&B>,
        timeout_options: Option<RequestTimeoutOptions>,
    ) -> Result<reqwest::Response, RemoteClientError>
    where
        B: Serialize,
    {
        let url = self
            .base
            .join(path)
            .map_err(|e| RemoteClientError::Url(e.to_string()))?;

        let retry_on_timeout = timeout_options.is_none_or(|o| o.retry_on_timeout);

        let operation = || async {
            let mut req = self
                .http
                .request(method.clone(), url.clone())
                .header("X-Client-Version", env!("CARGO_PKG_VERSION"))
                .header("X-Client-Type", "local-backend");

            if let Some(t) = timeout_options.map(|o| o.timeout) {
                req = req.timeout(t);
            }

            if requires_auth {
                let token = self.require_token().await?;
                req = req.bearer_auth(token);
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
        };

        operation
            .retry(
                &ExponentialBuilder::default()
                    .with_min_delay(Duration::from_millis(500))
                    .with_max_delay(Duration::from_secs(2))
                    .with_max_times(2)
                    .with_jitter(),
            )
            .when(move |e: &RemoteClientError| {
                if !e.should_retry() {
                    return false;
                }
                retry_on_timeout || !matches!(e, RemoteClientError::Timeout)
            })
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
            .send(reqwest::Method::GET, path, false, None::<&()>)
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
        let res = self.send(reqwest::Method::POST, path, false, body).await?;
        res.json::<T>()
            .await
            .map_err(|e| RemoteClientError::Serde(e.to_string()))
    }

    async fn post_public_with_timeout_options<T, B>(
        &self,
        path: &str,
        body: Option<&B>,
        timeout_options: RequestTimeoutOptions,
    ) -> Result<T, RemoteClientError>
    where
        T: for<'de> Deserialize<'de>,
        B: Serialize,
    {
        let res = self
            .send_internal(
                reqwest::Method::POST,
                path,
                false,
                body,
                Some(timeout_options),
            )
            .await?;
        res.json::<T>()
            .await
            .map_err(|e| RemoteClientError::Serde(e.to_string()))
    }

    // Authenticated endpoint helpers (require token)
    async fn get_authed<T>(&self, path: &str) -> Result<T, RemoteClientError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let res = self
            .send(reqwest::Method::GET, path, true, None::<&()>)
            .await?;
        res.json::<T>()
            .await
            .map_err(|e| RemoteClientError::Serde(e.to_string()))
    }

    pub async fn post_authed<T, B>(
        &self,
        path: &str,
        body: Option<&B>,
    ) -> Result<T, RemoteClientError>
    where
        T: for<'de> Deserialize<'de>,
        B: Serialize,
    {
        let res = self.send(reqwest::Method::POST, path, true, body).await?;
        res.json::<T>()
            .await
            .map_err(|e| RemoteClientError::Serde(e.to_string()))
    }

    async fn patch_authed<T, B>(&self, path: &str, body: &B) -> Result<T, RemoteClientError>
    where
        T: for<'de> Deserialize<'de>,
        B: Serialize,
    {
        let res = self
            .send(reqwest::Method::PATCH, path, true, Some(body))
            .await?;
        res.json::<T>()
            .await
            .map_err(|e| RemoteClientError::Serde(e.to_string()))
    }

    async fn delete_authed(&self, path: &str) -> Result<(), RemoteClientError> {
        self.send(reqwest::Method::DELETE, path, true, None::<&()>)
            .await?;
        Ok(())
    }

    async fn delete_authed_with_body<B>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<(), RemoteClientError>
    where
        B: Serialize,
    {
        self.send(reqwest::Method::DELETE, path, true, Some(body))
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
        self.send(
            reqwest::Method::POST,
            &format!("/v1/organizations/{org_id}/invitations/revoke"),
            true,
            Some(&body),
        )
        .await?;
        Ok(())
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

    /// Deletes a workspace on the remote server by its local workspace ID.
    pub async fn delete_workspace(
        &self,
        local_workspace_id: Uuid,
    ) -> Result<(), RemoteClientError> {
        self.delete_authed_with_body(
            "/v1/workspaces",
            &DeleteWorkspaceRequest { local_workspace_id },
        )
        .await
    }

    /// Gets a workspace from the remote server by its local workspace ID.
    pub async fn get_workspace_by_local_id(
        &self,
        local_workspace_id: Uuid,
    ) -> Result<Workspace, RemoteClientError> {
        self.get_authed(&format!("/v1/workspaces/by-local-id/{local_workspace_id}"))
            .await
    }

    /// Checks if a workspace exists on the remote server.
    pub async fn workspace_exists(
        &self,
        local_workspace_id: Uuid,
    ) -> Result<bool, RemoteClientError> {
        match self
            .send(
                reqwest::Method::HEAD,
                &format!("/v1/workspaces/exists/{local_workspace_id}"),
                true,
                None::<&()>,
            )
            .await
        {
            Ok(_) => Ok(true),
            Err(RemoteClientError::Http { status: 404, .. }) => Ok(false),
            Err(e) => Err(e),
        }
    }

    /// Updates a workspace on the remote server.
    pub async fn update_workspace(
        &self,
        local_workspace_id: Uuid,
        name: Option<Option<String>>,
        archived: Option<bool>,
        files_changed: Option<i32>,
        lines_added: Option<i32>,
        lines_removed: Option<i32>,
    ) -> Result<(), RemoteClientError> {
        self.send(
            reqwest::Method::PATCH,
            "/v1/workspaces",
            true,
            Some(&UpdateWorkspaceRequest {
                local_workspace_id,
                name,
                archived,
                files_changed: files_changed.map(Some),
                lines_added: lines_added.map(Some),
                lines_removed: lines_removed.map(Some),
            }),
        )
        .await?;
        Ok(())
    }

    /// Triggers issue-status sync for a workspace that was merged locally without a PR.
    pub async fn sync_issue_status_from_local_workspace_merge(
        &self,
        local_workspace_id: Uuid,
    ) -> Result<(), RemoteClientError> {
        self.send(
            reqwest::Method::POST,
            &format!("/v1/workspaces/{local_workspace_id}/sync_issue_status_from_local_merge"),
            true,
            None::<&()>,
        )
        .await?;
        Ok(())
    }

    /// Creates a workspace on the remote server, linking it to a local workspace and an issue.
    pub async fn create_workspace(
        &self,
        request: CreateWorkspaceRequest,
    ) -> Result<(), RemoteClientError> {
        self.send(
            reqwest::Method::POST,
            "/v1/workspaces",
            true,
            Some(&request),
        )
        .await?;
        Ok(())
    }

    // ── Issues ──────────────────────────────────────────────────────────

    /// Lists issues for a project.
    pub async fn list_issues(
        &self,
        project_id: Uuid,
    ) -> Result<ListIssuesResponse, RemoteClientError> {
        self.get_authed(&format!("/v1/issues?project_id={project_id}"))
            .await
    }

    /// Gets a single issue by ID.
    pub async fn get_issue(&self, issue_id: Uuid) -> Result<Issue, RemoteClientError> {
        self.get_authed(&format!("/v1/issues/{issue_id}")).await
    }

    /// Creates a new issue.
    pub async fn create_issue(
        &self,
        request: &CreateIssueRequest,
    ) -> Result<MutationResponse<Issue>, RemoteClientError> {
        self.post_authed("/v1/issues", Some(request)).await
    }

    /// Updates an existing issue.
    pub async fn update_issue(
        &self,
        issue_id: Uuid,
        request: &UpdateIssueRequest,
    ) -> Result<MutationResponse<Issue>, RemoteClientError> {
        self.patch_authed(&format!("/v1/issues/{issue_id}"), request)
            .await
    }

    /// Deletes an issue.
    pub async fn delete_issue(&self, issue_id: Uuid) -> Result<DeleteResponse, RemoteClientError> {
        let res = self
            .send(
                reqwest::Method::DELETE,
                &format!("/v1/issues/{issue_id}"),
                true,
                None::<&()>,
            )
            .await?;
        res.json::<DeleteResponse>()
            .await
            .map_err(|e| RemoteClientError::Serde(e.to_string()))
    }

    // ── Issue Assignees ────────────────────────────────────────────────

    /// Lists assignees for an issue.
    pub async fn list_issue_assignees(
        &self,
        issue_id: Uuid,
    ) -> Result<ListIssueAssigneesResponse, RemoteClientError> {
        self.get_authed(&format!("/v1/issue_assignees?issue_id={issue_id}"))
            .await
    }

    /// Gets a single issue assignee by ID.
    pub async fn get_issue_assignee(
        &self,
        issue_assignee_id: Uuid,
    ) -> Result<IssueAssignee, RemoteClientError> {
        self.get_authed(&format!("/v1/issue_assignees/{issue_assignee_id}"))
            .await
    }

    /// Creates a new issue assignee.
    pub async fn create_issue_assignee(
        &self,
        request: &CreateIssueAssigneeRequest,
    ) -> Result<MutationResponse<IssueAssignee>, RemoteClientError> {
        self.post_authed("/v1/issue_assignees", Some(request)).await
    }

    /// Deletes an issue assignee.
    pub async fn delete_issue_assignee(
        &self,
        issue_assignee_id: Uuid,
    ) -> Result<DeleteResponse, RemoteClientError> {
        let res = self
            .send(
                reqwest::Method::DELETE,
                &format!("/v1/issue_assignees/{issue_assignee_id}"),
                true,
                None::<&()>,
            )
            .await?;
        res.json::<DeleteResponse>()
            .await
            .map_err(|e| RemoteClientError::Serde(e.to_string()))
    }

    // ── Tags ───────────────────────────────────────────────────────────

    /// Lists tags for a project.
    pub async fn list_tags(&self, project_id: Uuid) -> Result<ListTagsResponse, RemoteClientError> {
        self.get_authed(&format!("/v1/tags?project_id={project_id}"))
            .await
    }

    /// Gets a single tag by ID.
    pub async fn get_tag(&self, tag_id: Uuid) -> Result<Tag, RemoteClientError> {
        self.get_authed(&format!("/v1/tags/{tag_id}")).await
    }

    // ── Issue Tags ─────────────────────────────────────────────────────

    /// Lists tags attached to an issue.
    pub async fn list_issue_tags(
        &self,
        issue_id: Uuid,
    ) -> Result<ListIssueTagsResponse, RemoteClientError> {
        self.get_authed(&format!("/v1/issue_tags?issue_id={issue_id}"))
            .await
    }

    /// Gets a single issue-tag relation by ID.
    pub async fn get_issue_tag(&self, issue_tag_id: Uuid) -> Result<IssueTag, RemoteClientError> {
        self.get_authed(&format!("/v1/issue_tags/{issue_tag_id}"))
            .await
    }

    /// Attaches a tag to an issue.
    pub async fn create_issue_tag(
        &self,
        request: &CreateIssueTagRequest,
    ) -> Result<MutationResponse<IssueTag>, RemoteClientError> {
        self.post_authed("/v1/issue_tags", Some(request)).await
    }

    /// Removes a tag from an issue.
    pub async fn delete_issue_tag(
        &self,
        issue_tag_id: Uuid,
    ) -> Result<DeleteResponse, RemoteClientError> {
        let res = self
            .send(
                reqwest::Method::DELETE,
                &format!("/v1/issue_tags/{issue_tag_id}"),
                true,
                None::<&()>,
            )
            .await?;
        res.json::<DeleteResponse>()
            .await
            .map_err(|e| RemoteClientError::Serde(e.to_string()))
    }

    // ── Issue Relationships ────────────────────────────────────────────

    /// Lists relationships for an issue.
    pub async fn list_issue_relationships(
        &self,
        issue_id: Uuid,
    ) -> Result<ListIssueRelationshipsResponse, RemoteClientError> {
        self.get_authed(&format!("/v1/issue_relationships?issue_id={issue_id}"))
            .await
    }

    /// Creates a new issue relationship.
    pub async fn create_issue_relationship(
        &self,
        request: &CreateIssueRelationshipRequest,
    ) -> Result<MutationResponse<IssueRelationship>, RemoteClientError> {
        self.post_authed("/v1/issue_relationships", Some(request))
            .await
    }

    /// Deletes an issue relationship.
    pub async fn delete_issue_relationship(
        &self,
        relationship_id: Uuid,
    ) -> Result<(), RemoteClientError> {
        self.delete_authed(&format!("/v1/issue_relationships/{relationship_id}"))
            .await
    }

    // ── Remote Projects ─────────────────────────────────────────────────

    /// Gets a single remote project by ID.
    pub async fn get_remote_project(
        &self,
        project_id: Uuid,
    ) -> Result<api_types::Project, RemoteClientError> {
        self.get_authed(&format!("/v1/projects/{project_id}")).await
    }

    /// Lists projects for an organization.
    pub async fn list_remote_projects(
        &self,
        organization_id: Uuid,
    ) -> Result<ListProjectsResponse, RemoteClientError> {
        self.get_authed(&format!("/v1/projects?organization_id={organization_id}"))
            .await
    }

    // ── Project Statuses ────────────────────────────────────────────────

    /// Lists project statuses for a project (used for status name ↔ UUID mapping).
    pub async fn list_project_statuses(
        &self,
        project_id: Uuid,
    ) -> Result<ListProjectStatusesResponse, RemoteClientError> {
        self.get_authed(&format!("/v1/project_statuses?project_id={project_id}"))
            .await
    }

    // ── Pull Requests ───────────────────────────────────────────────────

    /// Upserts a pull request on the remote server.
    /// Creates if not exists, updates if exists.
    pub async fn upsert_pull_request(
        &self,
        request: UpsertPullRequestRequest,
    ) -> Result<(), RemoteClientError> {
        self.send(
            reqwest::Method::PUT,
            "/v1/pull_requests",
            true,
            Some(&request),
        )
        .await?;
        Ok(())
    }

    /// Lists pull requests linked to an issue.
    pub async fn list_pull_requests(
        &self,
        issue_id: Uuid,
    ) -> Result<ListPullRequestsResponse, RemoteClientError> {
        self.get_authed(&format!("/v1/pull_requests?issue_id={issue_id}"))
            .await
    }

    /// Lists attachments for an issue on the remote server.
    pub async fn list_issue_attachments(
        &self,
        issue_id: Uuid,
    ) -> Result<ListAttachmentsResponse, RemoteClientError> {
        self.get_authed(&format!("/v1/issues/{issue_id}/attachments"))
            .await
    }

    /// Used for fetching from presigned Azure SAS URLs.
    pub async fn download_from_url(&self, url: &str) -> Result<Vec<u8>, RemoteClientError> {
        let res = self.http.get(url).send().await.map_err(map_reqwest_error)?;
        if !res.status().is_success() {
            return Err(RemoteClientError::Http {
                status: res.status().as_u16(),
                body: res.text().await.unwrap_or_default(),
            });
        }
        let bytes = res
            .bytes()
            .await
            .map_err(|e| RemoteClientError::Transport(e.to_string()))?;
        Ok(bytes.to_vec())
    }
}

fn map_reqwest_error(e: reqwest::Error) -> RemoteClientError {
    if e.is_timeout() {
        RemoteClientError::Timeout
    } else {
        RemoteClientError::Transport(e.to_string())
    }
}
