use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};

use super::error::ErrorResponse;
use crate::{
    AppState,
    auth::RequestContext,
    db::identity::{IdentityRepository, Organization, OrganizationWithRole},
};

#[derive(Debug, Deserialize)]
pub struct CreateOrganizationRequest {
    pub name: String,
    pub slug: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateOrganizationRequest {
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct CreateOrganizationResponse {
    pub organization: OrganizationWithRole,
}

#[derive(Debug, Serialize)]
pub struct ListOrganizationsResponse {
    pub organizations: Vec<OrganizationWithRole>,
}

#[derive(Debug, Serialize)]
pub struct GetOrganizationResponse {
    pub organization: Organization,
    pub user_role: String,
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

    let identity_repo = IdentityRepository::new(&state.pool);

    let organization = identity_repo
        .create_organization(name, &slug, &ctx.user.id)
        .await
        .map_err(|e| match e {
            crate::db::identity::IdentityError::OrganizationConflict(msg) => {
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
    let identity_repo = IdentityRepository::new(&state.pool);

    let organizations = identity_repo
        .list_user_organizations(&ctx.user.id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    Ok(Json(ListOrganizationsResponse { organizations }))
}

pub async fn get_organization(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<String>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let identity_repo = IdentityRepository::new(&state.pool);

    identity_repo
        .assert_membership(&org_id, &ctx.user.id)
        .await
        .map_err(|e| match e {
            crate::db::identity::IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::NOT_FOUND, "Organization not found")
            }
            _ => ErrorResponse::new(StatusCode::FORBIDDEN, "Access denied"),
        })?;

    let organization = identity_repo
        .fetch_organization(&org_id)
        .await
        .map_err(|_| {
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to fetch organization",
            )
        })?;

    let role = identity_repo
        .check_user_role(&org_id, &ctx.user.id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
        .unwrap_or(crate::db::identity::MemberRole::Member);

    let user_role = match role {
        crate::db::identity::MemberRole::Admin => "admin",
        crate::db::identity::MemberRole::Member => "member",
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
    Path(org_id): Path<String>,
    Json(payload): Json<UpdateOrganizationRequest>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let name = payload.name.trim();

    if name.is_empty() || name.len() > 100 {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Organization name must be between 1 and 100 characters",
        ));
    }

    let identity_repo = IdentityRepository::new(&state.pool);

    let organization = identity_repo
        .update_organization_name(&org_id, &ctx.user.id, name)
        .await
        .map_err(|e| match e {
            crate::db::identity::IdentityError::PermissionDenied => {
                ErrorResponse::new(StatusCode::FORBIDDEN, "Admin access required")
            }
            crate::db::identity::IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::NOT_FOUND, "Organization not found")
            }
            _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        })?;

    Ok(Json(organization))
}

pub async fn delete_organization(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<String>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let identity_repo = IdentityRepository::new(&state.pool);

    identity_repo
        .delete_organization(&org_id, &ctx.user.id)
        .await
        .map_err(|e| match e {
            crate::db::identity::IdentityError::PermissionDenied => {
                ErrorResponse::new(StatusCode::FORBIDDEN, "Admin access required")
            }
            crate::db::identity::IdentityError::CannotDeleteOrganization(msg) => {
                ErrorResponse::new(StatusCode::CONFLICT, msg)
            }
            crate::db::identity::IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::NOT_FOUND, "Organization not found")
            }
            _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        })?;

    Ok(StatusCode::NO_CONTENT)
}
