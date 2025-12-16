use axum::{
    Json, Router,
    body::Bytes,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Redirect, Response},
    routing::{delete, get, patch, post},
};
use chrono::{Duration, Utc};
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};
use uuid::Uuid;

use super::error::ErrorResponse;
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        github_app::GitHubAppRepository2, identity_errors::IdentityError,
        organizations::OrganizationRepository,
    },
    github_app::{PrReviewParams, PrReviewService, verify_webhook_signature},
};

// ========== Public Routes ==========

pub fn public_router() -> Router<AppState> {
    Router::new()
        .route("/github/webhook", post(handle_webhook))
        .route("/github/app/callback", get(handle_callback))
}

// ========== Protected Routes ==========

pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route(
            "/organizations/{org_id}/github-app/install-url",
            get(get_install_url),
        )
        .route("/organizations/{org_id}/github-app/status", get(get_status))
        .route("/organizations/{org_id}/github-app", delete(uninstall))
        .route(
            "/organizations/{org_id}/github-app/repositories",
            get(fetch_repositories),
        )
        .route(
            "/organizations/{org_id}/github-app/repositories/review-enabled",
            patch(bulk_update_review_enabled),
        )
        .route(
            "/organizations/{org_id}/github-app/repositories/{repo_id}/review-enabled",
            patch(update_repo_review_enabled),
        )
        .route("/debug/pr-review/trigger", post(trigger_pr_review))
}

// ========== Types ==========

#[derive(Debug, Serialize)]
pub struct InstallUrlResponse {
    pub install_url: String,
}

#[derive(Debug, Serialize)]
pub struct GitHubAppStatusResponse {
    pub installed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installation: Option<InstallationDetails>,
    pub repositories: Vec<RepositoryDetails>,
}

#[derive(Debug, Serialize)]
pub struct InstallationDetails {
    pub id: String,
    pub github_installation_id: i64,
    pub github_account_login: String,
    pub github_account_type: String,
    pub repository_selection: String,
    pub suspended_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct RepositoryDetails {
    pub id: String,
    pub github_repo_id: i64,
    pub repo_full_name: String,
    pub review_enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub installation_id: Option<i64>,
    pub state: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TriggerPrReviewRequest {
    /// GitHub PR URL, e.g., "https://github.com/owner/repo/pull/123"
    pub pr_url: String,
}

#[derive(Debug, Serialize)]
pub struct TriggerPrReviewResponse {
    pub review_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRepoReviewEnabledRequest {
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
pub struct BulkUpdateReviewEnabledResponse {
    pub updated_count: u64,
}

// ========== Protected Route Handlers ==========

/// GET /v1/organizations/:org_id/github-app/install-url
/// Returns URL to install the GitHub App for this organization
pub async fn get_install_url(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<Uuid>,
) -> Result<impl IntoResponse, ErrorResponse> {
    // Check GitHub App is configured
    let github_app = state.github_app().ok_or_else(|| {
        ErrorResponse::new(StatusCode::NOT_IMPLEMENTED, "GitHub App not configured")
    })?;

    // Check user is admin of organization
    let org_repo = OrganizationRepository::new(state.pool());
    org_repo
        .assert_admin(org_id, ctx.user.id)
        .await
        .map_err(|e| match e {
            IdentityError::PermissionDenied => {
                ErrorResponse::new(StatusCode::FORBIDDEN, "Admin access required")
            }
            IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::NOT_FOUND, "Organization not found")
            }
            _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        })?;

    // Check not a personal org
    let is_personal = org_repo
        .is_personal(org_id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    if is_personal {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "GitHub App cannot be installed on personal organizations",
        ));
    }

    // Generate state token (simple format: org_id:user_id:timestamp)
    // In production, you'd want to sign this with HMAC
    let expires_at = Utc::now() + Duration::minutes(10);
    let state_token = format!("{}:{}:{}", org_id, ctx.user.id, expires_at.timestamp());

    // Store pending installation
    let gh_repo = GitHubAppRepository2::new(state.pool());
    gh_repo
        .create_pending(org_id, ctx.user.id, &state_token, expires_at)
        .await
        .map_err(|e| {
            error!(?e, "Failed to create pending installation");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?;

    // Build installation URL
    let install_url = format!(
        "https://github.com/apps/{}/installations/new?state={}",
        github_app.app_slug(),
        urlencoding::encode(&state_token)
    );

    Ok(Json(InstallUrlResponse { install_url }))
}

/// GET /v1/organizations/:org_id/github-app/status
/// Returns the GitHub App installation status for this organization
pub async fn get_status(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<Uuid>,
) -> Result<impl IntoResponse, ErrorResponse> {
    // Check user is member of organization
    let org_repo = OrganizationRepository::new(state.pool());
    org_repo
        .assert_membership(org_id, ctx.user.id)
        .await
        .map_err(|e| match e {
            IdentityError::PermissionDenied | IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::FORBIDDEN, "Access denied")
            }
            _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        })?;

    let gh_repo = GitHubAppRepository2::new(state.pool());

    let installation = gh_repo.get_by_organization(org_id).await.map_err(|e| {
        error!(?e, "Failed to get GitHub App installation");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
    })?;

    match installation {
        Some(inst) => {
            // Return cached repos from DB (fast) - use GET /repositories to fetch fresh data
            let repositories = gh_repo.get_repositories(inst.id).await.map_err(|e| {
                error!(?e, "Failed to get repositories");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
            })?;

            Ok(Json(GitHubAppStatusResponse {
                installed: true,
                installation: Some(InstallationDetails {
                    id: inst.id.to_string(),
                    github_installation_id: inst.github_installation_id,
                    github_account_login: inst.github_account_login,
                    github_account_type: inst.github_account_type,
                    repository_selection: inst.repository_selection,
                    suspended_at: inst.suspended_at.map(|t| t.to_rfc3339()),
                    created_at: inst.created_at.to_rfc3339(),
                }),
                repositories: repositories
                    .into_iter()
                    .map(|r| RepositoryDetails {
                        id: r.id.to_string(),
                        github_repo_id: r.github_repo_id,
                        repo_full_name: r.repo_full_name,
                        review_enabled: r.review_enabled,
                    })
                    .collect(),
            }))
        }
        None => Ok(Json(GitHubAppStatusResponse {
            installed: false,
            installation: None,
            repositories: vec![],
        })),
    }
}

/// DELETE /v1/organizations/:org_id/github-app
/// Removes the local installation record (does not uninstall from GitHub)
pub async fn uninstall(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<Uuid>,
) -> Result<impl IntoResponse, ErrorResponse> {
    // Check user is admin of organization
    let org_repo = OrganizationRepository::new(state.pool());
    org_repo
        .assert_admin(org_id, ctx.user.id)
        .await
        .map_err(|e| match e {
            IdentityError::PermissionDenied => {
                ErrorResponse::new(StatusCode::FORBIDDEN, "Admin access required")
            }
            IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::NOT_FOUND, "Organization not found")
            }
            _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        })?;

    let gh_repo = GitHubAppRepository2::new(state.pool());
    gh_repo.delete_by_organization(org_id).await.map_err(|e| {
        error!(?e, "Failed to delete GitHub App installation");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
    })?;

    info!(org_id = %org_id, user_id = %ctx.user.id, "GitHub App installation removed");
    Ok(StatusCode::NO_CONTENT)
}

/// PATCH /v1/organizations/:org_id/github-app/repositories/:repo_id/review-enabled
/// Toggle whether a repository should trigger PR reviews
pub async fn update_repo_review_enabled(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path((org_id, repo_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateRepoReviewEnabledRequest>,
) -> Result<impl IntoResponse, ErrorResponse> {
    // Check user is admin of organization
    let org_repo = OrganizationRepository::new(state.pool());
    org_repo
        .assert_admin(org_id, ctx.user.id)
        .await
        .map_err(|e| match e {
            IdentityError::PermissionDenied => {
                ErrorResponse::new(StatusCode::FORBIDDEN, "Admin access required")
            }
            IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::NOT_FOUND, "Organization not found")
            }
            _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        })?;

    // Get installation for this org
    let gh_repo = GitHubAppRepository2::new(state.pool());
    let installation = gh_repo
        .get_by_organization(org_id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "GitHub App not installed"))?;

    // Update the repository
    let updated = gh_repo
        .update_repository_review_enabled(repo_id, installation.id, payload.enabled)
        .await
        .map_err(|e| {
            error!(?e, "Failed to update repository review_enabled");
            match e {
                crate::db::github_app::GitHubAppDbError::NotFound => {
                    ErrorResponse::new(StatusCode::NOT_FOUND, "Repository not found")
                }
                _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
            }
        })?;

    info!(
        org_id = %org_id,
        repo_id = %repo_id,
        review_enabled = payload.enabled,
        "Repository review_enabled updated"
    );

    Ok(Json(RepositoryDetails {
        id: updated.id.to_string(),
        github_repo_id: updated.github_repo_id,
        repo_full_name: updated.repo_full_name,
        review_enabled: updated.review_enabled,
    }))
}

/// GET /v1/organizations/:org_id/github-app/repositories
/// Fetches repositories from GitHub API, syncs to DB, and returns the list
pub async fn fetch_repositories(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<Uuid>,
) -> Result<impl IntoResponse, ErrorResponse> {
    // Check user is member of organization
    let org_repo = OrganizationRepository::new(state.pool());
    org_repo
        .assert_membership(org_id, ctx.user.id)
        .await
        .map_err(|e| match e {
            IdentityError::PermissionDenied | IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::FORBIDDEN, "Access denied")
            }
            _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        })?;

    let gh_repo = GitHubAppRepository2::new(state.pool());

    let installation = gh_repo
        .get_by_organization(org_id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "GitHub App not installed"))?;

    // Fetch repos from GitHub API and sync to DB
    let github_app = state.github_app().ok_or_else(|| {
        ErrorResponse::new(StatusCode::NOT_IMPLEMENTED, "GitHub App not configured")
    })?;

    match github_app
        .list_installation_repos(installation.github_installation_id)
        .await
    {
        Ok(repos) => {
            let repo_data: Vec<(i64, String)> =
                repos.into_iter().map(|r| (r.id, r.full_name)).collect();
            if let Err(e) = gh_repo.sync_repositories(installation.id, &repo_data).await {
                warn!(?e, "Failed to sync repositories from GitHub API");
            }
        }
        Err(e) => {
            warn!(?e, "Failed to fetch repositories from GitHub API");
            // Continue with cached data
        }
    }

    // Return the (now updated) list from DB
    let repositories = gh_repo
        .get_repositories(installation.id)
        .await
        .map_err(|e| {
            error!(?e, "Failed to get repositories");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?;

    Ok(Json(
        repositories
            .into_iter()
            .map(|r| RepositoryDetails {
                id: r.id.to_string(),
                github_repo_id: r.github_repo_id,
                repo_full_name: r.repo_full_name,
                review_enabled: r.review_enabled,
            })
            .collect::<Vec<_>>(),
    ))
}

/// PATCH /v1/organizations/:org_id/github-app/repositories/review-enabled
/// Bulk toggle review_enabled for all repositories
pub async fn bulk_update_review_enabled(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<Uuid>,
    Json(payload): Json<UpdateRepoReviewEnabledRequest>,
) -> Result<impl IntoResponse, ErrorResponse> {
    // Check user is admin of organization
    let org_repo = OrganizationRepository::new(state.pool());
    org_repo
        .assert_admin(org_id, ctx.user.id)
        .await
        .map_err(|e| match e {
            IdentityError::PermissionDenied => {
                ErrorResponse::new(StatusCode::FORBIDDEN, "Admin access required")
            }
            IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::NOT_FOUND, "Organization not found")
            }
            _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        })?;

    let gh_repo = GitHubAppRepository2::new(state.pool());
    let installation = gh_repo
        .get_by_organization(org_id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
        .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "GitHub App not installed"))?;

    let updated_count = gh_repo
        .set_all_repositories_review_enabled(installation.id, payload.enabled)
        .await
        .map_err(|e| {
            error!(?e, "Failed to bulk update review_enabled");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?;

    info!(
        org_id = %org_id,
        review_enabled = payload.enabled,
        updated_count,
        "Bulk updated repository review_enabled"
    );

    Ok(Json(BulkUpdateReviewEnabledResponse { updated_count }))
}

// ========== Public Route Handlers ==========

/// GET /v1/github/app/callback
/// Handles redirect from GitHub after app installation
pub async fn handle_callback(
    State(state): State<AppState>,
    Query(query): Query<CallbackQuery>,
) -> Response {
    let frontend_base = state
        .config
        .server_public_base_url
        .clone()
        .unwrap_or_else(|| "http://localhost:3000".to_string());

    // Helper to redirect with error
    let redirect_error = |org_id: Option<Uuid>, error: &str| -> Response {
        let url = match org_id {
            Some(id) => format!(
                "{}/account/organizations/{}?github_app_error={}",
                frontend_base,
                id,
                urlencoding::encode(error)
            ),
            None => format!(
                "{}/account?github_app_error={}",
                frontend_base,
                urlencoding::encode(error)
            ),
        };
        Redirect::temporary(&url).into_response()
    };

    // Check GitHub App is configured
    let Some(github_app) = state.github_app() else {
        return redirect_error(None, "GitHub App not configured");
    };

    // Validate required params
    let Some(installation_id) = query.installation_id else {
        return redirect_error(None, "Missing installation_id");
    };

    let Some(state_token) = query.state else {
        return redirect_error(None, "Missing state parameter");
    };

    // Parse state token: org_id:user_id:timestamp
    let parts: Vec<&str> = state_token.split(':').collect();
    if parts.len() != 3 {
        return redirect_error(None, "Invalid state token format");
    }

    let Ok(org_id) = Uuid::parse_str(parts[0]) else {
        return redirect_error(None, "Invalid organization ID in state");
    };

    let Ok(user_id) = Uuid::parse_str(parts[1]) else {
        return redirect_error(Some(org_id), "Invalid user ID in state");
    };

    let Ok(timestamp) = parts[2].parse::<i64>() else {
        return redirect_error(Some(org_id), "Invalid timestamp in state");
    };

    // Check expiry
    if Utc::now().timestamp() > timestamp {
        return redirect_error(Some(org_id), "Installation link expired");
    }

    // Verify pending installation exists
    let gh_repo = GitHubAppRepository2::new(state.pool());
    let pending = match gh_repo.get_pending_by_state(&state_token).await {
        Ok(Some(p)) => p,
        Ok(None) => {
            return redirect_error(Some(org_id), "Installation not found or expired");
        }
        Err(e) => {
            error!(?e, "Failed to get pending installation");
            return redirect_error(Some(org_id), "Database error");
        }
    };

    // Fetch installation details from GitHub
    let installation_info = match github_app.get_installation(installation_id).await {
        Ok(info) => info,
        Err(e) => {
            error!(?e, "Failed to get installation from GitHub");
            return redirect_error(Some(org_id), "Failed to verify installation with GitHub");
        }
    };

    // Create installation record
    if let Err(e) = gh_repo
        .create_installation(
            pending.organization_id,
            installation_id,
            &installation_info.account.login,
            &installation_info.account.account_type,
            &installation_info.repository_selection,
            user_id,
        )
        .await
    {
        error!(?e, "Failed to create installation record");
        return redirect_error(Some(org_id), "Failed to save installation");
    }

    // Delete pending record
    if let Err(e) = gh_repo.delete_pending(&state_token).await {
        warn!(?e, "Failed to delete pending installation record");
    }

    // Fetch and store repositories if selection is "selected"
    if installation_info.repository_selection == "selected"
        && let Ok(repos) = github_app.list_installation_repos(installation_id).await
    {
        let installation = gh_repo
            .get_by_github_id(installation_id)
            .await
            .ok()
            .flatten();
        if let Some(inst) = installation {
            let repo_data: Vec<(i64, String)> =
                repos.into_iter().map(|r| (r.id, r.full_name)).collect();
            if let Err(e) = gh_repo.sync_repositories(inst.id, &repo_data).await {
                warn!(?e, "Failed to sync repositories");
            }
        }
    }

    info!(
        org_id = %org_id,
        installation_id = installation_id,
        account = %installation_info.account.login,
        "GitHub App installed successfully"
    );

    // Redirect to organization page with success
    let url = format!(
        "{}/account/organizations/{}?github_app=installed",
        frontend_base, org_id
    );
    Redirect::temporary(&url).into_response()
}

/// POST /v1/github/webhook
/// Handles webhook events from GitHub
pub async fn handle_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    // Check GitHub App is configured
    let Some(github_app) = state.github_app() else {
        warn!("Received webhook but GitHub App not configured");
        return StatusCode::NOT_IMPLEMENTED.into_response();
    };

    // Verify signature
    let signature = headers
        .get("X-Hub-Signature-256")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if !verify_webhook_signature(
        github_app.webhook_secret().expose_secret().as_bytes(),
        signature,
        &body,
    ) {
        warn!("Invalid webhook signature");
        return StatusCode::UNAUTHORIZED.into_response();
    }

    // Get event type
    let event_type = headers
        .get("X-GitHub-Event")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown");

    info!(event_type, "Received GitHub webhook");

    // Parse payload
    let payload: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(e) => {
            warn!(?e, "Failed to parse webhook payload");
            return StatusCode::BAD_REQUEST.into_response();
        }
    };

    // Handle different event types
    match event_type {
        "installation" => handle_installation_event(&state, &payload).await,
        "installation_repositories" => handle_installation_repos_event(&state, &payload).await,
        "pull_request" => handle_pull_request_event(&state, github_app, &payload).await,
        _ => {
            info!(event_type, "Ignoring unhandled webhook event");
            StatusCode::OK.into_response()
        }
    }
}

// ========== Webhook Event Handlers ==========

async fn handle_installation_event(state: &AppState, payload: &serde_json::Value) -> Response {
    let action = payload["action"].as_str().unwrap_or("");
    let installation_id = payload["installation"]["id"].as_i64().unwrap_or(0);

    info!(action, installation_id, "Processing installation event");

    let gh_repo = GitHubAppRepository2::new(state.pool());

    match action {
        "deleted" => {
            if let Err(e) = gh_repo.delete_by_github_id(installation_id).await {
                error!(?e, "Failed to delete installation");
            } else {
                info!(installation_id, "Installation deleted");
            }
        }
        "suspend" => {
            if let Err(e) = gh_repo.suspend(installation_id).await {
                error!(?e, "Failed to suspend installation");
            } else {
                info!(installation_id, "Installation suspended");
            }
        }
        "unsuspend" => {
            if let Err(e) = gh_repo.unsuspend(installation_id).await {
                error!(?e, "Failed to unsuspend installation");
            } else {
                info!(installation_id, "Installation unsuspended");
            }
        }
        "created" => {
            // Installation created via webhook (without going through our flow)
            // This shouldn't happen if orphan installations are rejected
            info!(
                installation_id,
                "Installation created event received (orphan)"
            );
        }
        _ => {
            info!(action, "Ignoring installation action");
        }
    }

    StatusCode::OK.into_response()
}

async fn handle_installation_repos_event(
    state: &AppState,
    payload: &serde_json::Value,
) -> Response {
    let action = payload["action"].as_str().unwrap_or("");
    let installation_id = payload["installation"]["id"].as_i64().unwrap_or(0);

    info!(
        action,
        installation_id, "Processing installation_repositories event"
    );

    let gh_repo = GitHubAppRepository2::new(state.pool());

    // Get our installation record
    let installation = match gh_repo.get_by_github_id(installation_id).await {
        Ok(Some(inst)) => inst,
        Ok(None) => {
            info!(installation_id, "Installation not found, ignoring");
            return StatusCode::OK.into_response();
        }
        Err(e) => {
            error!(?e, "Failed to get installation");
            return StatusCode::OK.into_response();
        }
    };

    match action {
        "added" => {
            let repos: Vec<(i64, String)> = payload["repositories_added"]
                .as_array()
                .unwrap_or(&vec![])
                .iter()
                .filter_map(|r| {
                    let id = r["id"].as_i64()?;
                    let name = r["full_name"].as_str()?;
                    Some((id, name.to_string()))
                })
                .collect();

            if let Err(e) = gh_repo.add_repositories(installation.id, &repos).await {
                error!(?e, "Failed to add repositories");
            } else {
                info!(installation_id, count = repos.len(), "Repositories added");
            }
        }
        "removed" => {
            let repo_ids: Vec<i64> = payload["repositories_removed"]
                .as_array()
                .unwrap_or(&vec![])
                .iter()
                .filter_map(|r| r["id"].as_i64())
                .collect();

            if let Err(e) = gh_repo
                .remove_repositories(installation.id, &repo_ids)
                .await
            {
                error!(?e, "Failed to remove repositories");
            } else {
                info!(
                    installation_id,
                    count = repo_ids.len(),
                    "Repositories removed"
                );
            }
        }
        _ => {
            info!(action, "Ignoring repositories action");
        }
    }

    // Update repository selection if changed
    let new_selection = payload["repository_selection"].as_str().unwrap_or("");
    if !new_selection.is_empty()
        && new_selection != installation.repository_selection
        && let Err(e) = gh_repo
            .update_repository_selection(installation_id, new_selection)
            .await
    {
        error!(?e, "Failed to update repository selection");
    }

    StatusCode::OK.into_response()
}

async fn handle_pull_request_event(
    state: &AppState,
    github_app: &crate::github_app::GitHubAppService,
    payload: &serde_json::Value,
) -> Response {
    use crate::github_app::{PrReviewParams, PrReviewService};

    let action = payload["action"].as_str().unwrap_or("");

    // Only handle opened PRs
    if action != "opened" {
        return StatusCode::OK.into_response();
    }

    let installation_id = payload["installation"]["id"].as_i64().unwrap_or(0);
    let pr_number = payload["pull_request"]["number"].as_u64().unwrap_or(0);
    let repo_owner = payload["repository"]["owner"]["login"]
        .as_str()
        .unwrap_or("");
    let repo_name = payload["repository"]["name"].as_str().unwrap_or("");

    info!(
        installation_id,
        pr_number, repo_owner, repo_name, "Processing pull_request.opened event"
    );

    // Check if we have this installation
    let gh_repo = GitHubAppRepository2::new(state.pool());
    let installation = match gh_repo.get_by_github_id(installation_id).await {
        Ok(Some(inst)) => inst,
        Ok(None) => {
            info!(installation_id, "Installation not found, ignoring PR");
            return StatusCode::OK.into_response();
        }
        Err(e) => {
            error!(?e, "Failed to get installation");
            return StatusCode::OK.into_response();
        }
    };

    // Check if installation is suspended
    if installation.suspended_at.is_some() {
        info!(installation_id, "Installation is suspended, ignoring PR");
        return StatusCode::OK.into_response();
    }

    // Check if this repository has reviews enabled
    let github_repo_id = payload["repository"]["id"].as_i64().unwrap_or(0);
    let is_review_enabled = gh_repo
        .is_repository_review_enabled(installation.id, github_repo_id)
        .await
        .unwrap_or(true); // Default to true if lookup fails

    if !is_review_enabled {
        info!(
            installation_id,
            github_repo_id, repo_owner, repo_name, "Repository has reviews disabled, ignoring PR"
        );
        return StatusCode::OK.into_response();
    }

    // Check if R2 and review worker are configured
    let Some(r2) = state.r2() else {
        info!("R2 not configured, skipping PR review");
        return StatusCode::OK.into_response();
    };

    let Some(worker_base_url) = state.config.review_worker_base_url.as_ref() else {
        info!("Review worker not configured, skipping PR review");
        return StatusCode::OK.into_response();
    };

    // Extract PR metadata from payload
    let pr_title = payload["pull_request"]["title"]
        .as_str()
        .unwrap_or("Untitled PR")
        .to_string();
    let pr_body = payload["pull_request"]["body"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let head_sha = payload["pull_request"]["head"]["sha"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let base_ref = payload["pull_request"]["base"]["ref"]
        .as_str()
        .unwrap_or("main")
        .to_string();

    // Spawn async task to process PR review
    let github_app_clone = github_app.clone();
    let r2_clone = r2.clone();
    let http_client = state.http_client.clone();
    let worker_url = worker_base_url.clone();
    let server_url = state.server_public_base_url.clone();
    let pool = state.pool.clone();
    let repo_owner = repo_owner.to_string();
    let repo_name = repo_name.to_string();

    tokio::spawn(async move {
        let service = PrReviewService::new(
            github_app_clone,
            r2_clone,
            http_client,
            worker_url,
            server_url,
        );

        let params = PrReviewParams {
            installation_id,
            owner: repo_owner.clone(),
            repo: repo_name.clone(),
            pr_number,
            pr_title,
            pr_body,
            head_sha,
            base_ref,
        };

        if let Err(e) = service.process_pr_review(&pool, params).await {
            error!(
                ?e,
                installation_id, pr_number, repo_owner, repo_name, "Failed to start PR review"
            );
        }
    });

    StatusCode::OK.into_response()
}

// ========== Debug Endpoint ==========

/// Parse a GitHub PR URL into (owner, repo, pr_number)
fn parse_pr_url(url: &str) -> Option<(String, String, u64)> {
    // Parse URLs like: https://github.com/owner/repo/pull/123
    let url = url.trim_end_matches('/');
    let parts: Vec<&str> = url.split('/').collect();

    // Find "github.com" and get owner/repo/pull/number
    let github_idx = parts.iter().position(|&p| p == "github.com")?;

    if parts.len() < github_idx + 5 {
        return None;
    }

    let owner = parts[github_idx + 1].to_string();
    let repo = parts[github_idx + 2].to_string();

    if parts[github_idx + 3] != "pull" {
        return None;
    }

    let pr_number: u64 = parts[github_idx + 4].parse().ok()?;

    Some((owner, repo, pr_number))
}

/// POST /v1/debug/pr-review/trigger
/// Manually trigger a PR review for debugging purposes
pub async fn trigger_pr_review(
    State(state): State<AppState>,
    Json(payload): Json<TriggerPrReviewRequest>,
) -> Result<Json<TriggerPrReviewResponse>, ErrorResponse> {
    // 1. Parse PR URL
    let (owner, repo, pr_number) = parse_pr_url(&payload.pr_url)
        .ok_or_else(|| ErrorResponse::new(StatusCode::BAD_REQUEST, "Invalid PR URL format"))?;

    // 2. Validate services are configured
    let github_app = state.github_app().ok_or_else(|| {
        ErrorResponse::new(StatusCode::SERVICE_UNAVAILABLE, "GitHub App not configured")
    })?;
    let r2 = state
        .r2()
        .ok_or_else(|| ErrorResponse::new(StatusCode::SERVICE_UNAVAILABLE, "R2 not configured"))?;
    let worker_base_url = state
        .config
        .review_worker_base_url
        .as_ref()
        .ok_or_else(|| {
            ErrorResponse::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "Review worker not configured",
            )
        })?;

    // 3. Look up installation by owner
    let gh_repo = GitHubAppRepository2::new(state.pool());
    let installation = gh_repo
        .get_by_account_login(&owner)
        .await
        .map_err(|e| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| {
            ErrorResponse::new(
                StatusCode::NOT_FOUND,
                format!("No installation found for {}", owner),
            )
        })?;

    // 4. Fetch PR details from GitHub API
    let pr_details = github_app
        .get_pr_details(
            installation.github_installation_id,
            &owner,
            &repo,
            pr_number,
        )
        .await
        .map_err(|e| ErrorResponse::new(StatusCode::BAD_GATEWAY, e.to_string()))?;

    // 5. Create service and process review
    let service = PrReviewService::new(
        github_app.clone(),
        r2.clone(),
        state.http_client.clone(),
        worker_base_url.clone(),
        state.server_public_base_url.clone(),
    );

    let params = PrReviewParams {
        installation_id: installation.github_installation_id,
        owner,
        repo,
        pr_number,
        pr_title: pr_details.title,
        pr_body: pr_details.body.unwrap_or_default(),
        head_sha: pr_details.head.sha,
        base_ref: pr_details.base.ref_name,
    };

    let review_id = service
        .process_pr_review(state.pool(), params)
        .await
        .map_err(|e| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    info!(
        review_id = %review_id,
        pr_url = %payload.pr_url,
        "Manual PR review triggered"
    );

    Ok(Json(TriggerPrReviewResponse { review_id }))
}
