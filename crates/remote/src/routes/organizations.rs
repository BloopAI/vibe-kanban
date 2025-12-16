use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post},
};
use serde::{Deserialize, Serialize};
use tracing::{error, info};
use utils::api::organizations::{
    CreateOrganizationRequest, CreateOrganizationResponse, GetOrganizationResponse,
    ListOrganizationsResponse, MemberRole, UpdateOrganizationRequest,
};
use uuid::Uuid;

use super::error::ErrorResponse;
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        identity_errors::IdentityError, organization_members, organizations::OrganizationRepository,
        reviews::{ReviewListItem, ReviewRepository},
    },
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/organizations", post(create_organization))
        .route("/organizations", get(list_organizations))
        .route("/organizations/{org_id}", get(get_organization))
        .route("/organizations/{org_id}", patch(update_organization))
        .route("/organizations/{org_id}", delete(delete_organization))
        .route("/organizations/{org_id}/reviews", get(list_reviews))
        .route(
            "/organizations/{org_id}/reviews/trigger",
            post(trigger_review),
        )
}

// ========== Review Types ==========

#[derive(Debug, Deserialize)]
pub struct ListReviewsQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_limit() -> i64 {
    20
}

#[derive(Debug, Serialize)]
pub struct ListReviewsResponse {
    pub reviews: Vec<ReviewListItem>,
}

#[derive(Debug, Deserialize)]
pub struct TriggerReviewRequest {
    pub pr_url: String,
}

#[derive(Debug, Serialize)]
pub struct TriggerReviewResponse {
    pub review_id: Uuid,
}

pub async fn create_organization(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Json(payload): Json<CreateOrganizationRequest>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let name = payload.name.trim();
    let slug = payload.slug.trim().to_lowercase();

    if name.is_empty() || name.len() > 100 {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Organization name must be between 1 and 100 characters",
        ));
    }

    if slug.len() < 3 || slug.len() > 63 {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Organization slug must be between 3 and 63 characters",
        ));
    }

    if !slug
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Organization slug can only contain lowercase letters, numbers, hyphens, and underscores",
        ));
    }

    let org_repo = OrganizationRepository::new(&state.pool);

    let organization = org_repo
        .create_organization(name, &slug, ctx.user.id)
        .await
        .map_err(|e| match e {
            IdentityError::OrganizationConflict(msg) => {
                ErrorResponse::new(StatusCode::CONFLICT, msg)
            }
            _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        })?;

    Ok((
        StatusCode::CREATED,
        Json(CreateOrganizationResponse { organization }),
    ))
}

pub async fn list_organizations(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let org_repo = OrganizationRepository::new(&state.pool);

    let organizations = org_repo
        .list_user_organizations(ctx.user.id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    Ok(Json(ListOrganizationsResponse { organizations }))
}

pub async fn get_organization(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<Uuid>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let org_repo = OrganizationRepository::new(&state.pool);

    organization_members::assert_membership(&state.pool, org_id, ctx.user.id)
        .await
        .map_err(|e| match e {
            IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::NOT_FOUND, "Organization not found")
            }
            _ => ErrorResponse::new(StatusCode::FORBIDDEN, "Access denied"),
        })?;

    let organization = org_repo.fetch_organization(org_id).await.map_err(|_| {
        ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to fetch organization",
        )
    })?;

    let role = org_repo
        .check_user_role(org_id, ctx.user.id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
        .unwrap_or(MemberRole::Member);

    let user_role = match role {
        MemberRole::Admin => "ADMIN",
        MemberRole::Member => "MEMBER",
    }
    .to_string();

    Ok(Json(GetOrganizationResponse {
        organization,
        user_role,
    }))
}

pub async fn update_organization(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<Uuid>,
    Json(payload): Json<UpdateOrganizationRequest>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let name = payload.name.trim();

    if name.is_empty() || name.len() > 100 {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Organization name must be between 1 and 100 characters",
        ));
    }

    let org_repo = OrganizationRepository::new(&state.pool);

    let organization = org_repo
        .update_organization_name(org_id, ctx.user.id, name)
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

    Ok(Json(organization))
}

pub async fn delete_organization(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<Uuid>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let org_repo = OrganizationRepository::new(&state.pool);

    org_repo
        .delete_organization(org_id, ctx.user.id)
        .await
        .map_err(|e| match e {
            IdentityError::PermissionDenied => {
                ErrorResponse::new(StatusCode::FORBIDDEN, "Admin access required")
            }
            IdentityError::CannotDeleteOrganization(msg) => {
                ErrorResponse::new(StatusCode::CONFLICT, msg)
            }
            IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::NOT_FOUND, "Organization not found")
            }
            _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        })?;

    Ok(StatusCode::NO_CONTENT)
}

// ========== Review Handlers ==========

/// GET /v1/organizations/:org_id/reviews
/// List reviews for an organization. Requires org membership.
pub async fn list_reviews(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<Uuid>,
    Query(query): Query<ListReviewsQuery>,
) -> Result<impl IntoResponse, ErrorResponse> {
    // Check user is member of organization
    organization_members::assert_membership(&state.pool, org_id, ctx.user.id)
        .await
        .map_err(|e| match e {
            IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::NOT_FOUND, "Organization not found")
            }
            _ => ErrorResponse::new(StatusCode::FORBIDDEN, "Access denied"),
        })?;

    let review_repo = ReviewRepository::new(&state.pool);
    let reviews = review_repo
        .list_by_organization(org_id, query.limit.min(100), query.offset)
        .await
        .map_err(|e| {
            error!(?e, "Failed to list reviews");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?;

    Ok(Json(ListReviewsResponse { reviews }))
}

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

/// POST /v1/organizations/:org_id/reviews/trigger
/// Manually trigger a PR review. Requires org admin role.
pub async fn trigger_review(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<Uuid>,
    Json(payload): Json<TriggerReviewRequest>,
) -> Result<impl IntoResponse, ErrorResponse> {
    use crate::{db::github_app::GitHubAppRepository2, github_app::PrReviewService};

    // Check user is admin of organization
    let org_repo = OrganizationRepository::new(&state.pool);
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

    // Parse PR URL
    let (owner, repo, pr_number) = parse_pr_url(&payload.pr_url)
        .ok_or_else(|| ErrorResponse::new(StatusCode::BAD_REQUEST, "Invalid PR URL format"))?;

    // Check if we have a GitHub App installation for this org
    let gh_repo = GitHubAppRepository2::new(&state.pool);
    let installation = gh_repo
        .get_by_organization(org_id)
        .await
        .map_err(|e| {
            error!(?e, "Failed to get GitHub App installation");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        })?;

    // Validate services are configured
    let github_app = state.github_app().ok_or_else(|| {
        ErrorResponse::new(StatusCode::SERVICE_UNAVAILABLE, "GitHub App not configured")
    })?;
    let r2 = state.r2().ok_or_else(|| {
        ErrorResponse::new(StatusCode::SERVICE_UNAVAILABLE, "R2 not configured")
    })?;
    let worker_base_url = state.config.review_worker_base_url.as_ref().ok_or_else(|| {
        ErrorResponse::new(
            StatusCode::SERVICE_UNAVAILABLE,
            "Review worker not configured",
        )
    })?;

    // Get the installation_id - either from our installation or look up by owner
    let installation_id = if let Some(ref inst) = installation {
        inst.github_installation_id
    } else {
        // Try to find installation by repo owner
        let owner_installation = gh_repo
            .get_by_account_login(&owner)
            .await
            .map_err(|e| {
                error!(?e, "Failed to look up installation by owner");
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
            })?
            .ok_or_else(|| {
                ErrorResponse::new(
                    StatusCode::BAD_REQUEST,
                    format!(
                        "No GitHub App installation found for '{}'. Please install the GitHub App first.",
                        owner
                    ),
                )
            })?;
        owner_installation.github_installation_id
    };

    // Fetch PR details from GitHub API
    let pr_details = github_app
        .get_pr_details(installation_id, &owner, &repo, pr_number)
        .await
        .map_err(|e| {
            error!(?e, "Failed to get PR details from GitHub");
            ErrorResponse::new(StatusCode::BAD_GATEWAY, format!("GitHub API error: {}", e))
        })?;

    // Create service and process review
    let service = PrReviewService::new(
        github_app.clone(),
        r2.clone(),
        state.http_client.clone(),
        worker_base_url.clone(),
        state.server_public_base_url.clone(),
    );

    let params = crate::github_app::PrReviewParams {
        installation_id,
        organization_id: org_id,
        owner: owner.clone(),
        repo: repo.clone(),
        pr_number,
        pr_title: pr_details.title.clone(),
        pr_body: pr_details.body.clone().unwrap_or_default(),
        head_sha: pr_details.head.sha.clone(),
        base_sha: pr_details.base.sha.clone(),
    };

    let review_id = service
        .process_pr_review(&state.pool, params)
        .await
        .map_err(|e| {
            error!(?e, "Failed to process PR review");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, format!("Review failed: {}", e))
        })?;

    info!(
        review_id = %review_id,
        org_id = %org_id,
        pr_url = %payload.pr_url,
        "Manual PR review triggered"
    );

    Ok(Json(TriggerReviewResponse { review_id }))
}
