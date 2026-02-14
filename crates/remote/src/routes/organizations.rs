use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post},
};
use api_types::{
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
    },
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/organizations", post(create_organization))
        .route("/organizations", get(list_organizations))
        .route("/organizations/{org_id}", get(get_organization))
        .route("/organizations/{org_id}", patch(update_organization))
        .route("/organizations/{org_id}", delete(delete_organization))
}

#[utoipa::path(
    post, path = "/v1/organizations",
    tag = "Organizations",
    request_body = CreateOrganizationRequest,
    responses((status = 201, description = "Organization created"), (status = 400, description = "Bad request"), (status = 409, description = "Conflict")),
    security(("bearer_auth" = []))
)]
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

    if let Some(analytics) = state.analytics() {
        analytics.track(
            ctx.user.id,
            "organization_created",
            serde_json::json!({
                "organization_id": organization.id,
            }),
        );
    }

    Ok((
        StatusCode::CREATED,
        Json(CreateOrganizationResponse { organization }),
    ))
}

#[utoipa::path(
    get, path = "/v1/organizations",
    tag = "Organizations",
    responses((status = 200, description = "List of organizations")),
    security(("bearer_auth" = []))
)]
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

#[utoipa::path(
    get, path = "/v1/organizations/{org_id}",
    tag = "Organizations",
    params(("org_id" = Uuid, Path, description = "Organization ID")),
    responses((status = 200, description = "Organization found"), (status = 404, description = "Not found"), (status = 403, description = "Forbidden")),
    security(("bearer_auth" = []))
)]
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

#[utoipa::path(
    patch, path = "/v1/organizations/{org_id}",
    tag = "Organizations",
    params(("org_id" = Uuid, Path, description = "Organization ID")),
    request_body = UpdateOrganizationRequest,
    responses((status = 200, description = "Organization updated"), (status = 403, description = "Forbidden"), (status = 404, description = "Not found")),
    security(("bearer_auth" = []))
)]
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

#[utoipa::path(
    delete, path = "/v1/organizations/{org_id}",
    tag = "Organizations",
    params(("org_id" = Uuid, Path, description = "Organization ID")),
    responses((status = 204, description = "Organization deleted"), (status = 403, description = "Forbidden"), (status = 404, description = "Not found")),
    security(("bearer_auth" = []))
)]
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
