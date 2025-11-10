use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::error::ErrorResponse;
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        identity_errors::IdentityError,
        invitations::{Invitation, InvitationRepository},
        organizations::{MemberRole, OrganizationRepository},
    },
};

pub fn public_router() -> Router<AppState> {
    Router::new().route("/invitations/{token}", get(get_invitation))
}

pub fn protected_router() -> Router<AppState> {
    Router::new()
        .route(
            "/organizations/{org_id}/invitations",
            post(create_invitation),
        )
        .route("/organizations/{org_id}/invitations", get(list_invitations))
        .route("/invitations/{token}/accept", post(accept_invitation))
}

#[derive(Debug, Deserialize)]
pub struct CreateInvitationRequest {
    pub email: String,
    pub role: MemberRole,
}

#[derive(Debug, Serialize)]
pub struct CreateInvitationResponse {
    pub invitation: Invitation,
}

#[derive(Debug, Serialize)]
pub struct ListInvitationsResponse {
    pub invitations: Vec<Invitation>,
}

#[derive(Debug, Serialize)]
pub struct GetInvitationResponse {
    pub id: Uuid,
    pub organization_slug: String,
    pub role: MemberRole,
    pub expires_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct AcceptInvitationResponse {
    pub organization_id: String,
    pub organization_slug: String,
    pub role: MemberRole,
}

pub async fn create_invitation(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<String>,
    Json(payload): Json<CreateInvitationRequest>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let user = ctx.user;
    let organization = ctx.organization;
    if organization.id != org_id {
        return Err(ErrorResponse::new(
            StatusCode::FORBIDDEN,
            "Organization mismatch",
        ));
    }

    let invitation_repo = InvitationRepository::new(&state.pool);

    let token = Uuid::new_v4().to_string();
    let expires_at = Utc::now() + Duration::days(7);

    let invitation = invitation_repo
        .create_invitation(
            &org_id,
            &user.id,
            &payload.email,
            payload.role,
            expires_at,
            &token,
        )
        .await
        .map_err(|e| match e {
            IdentityError::PermissionDenied => {
                ErrorResponse::new(StatusCode::FORBIDDEN, "Admin access required")
            }
            IdentityError::InvitationError(msg) => ErrorResponse::new(StatusCode::BAD_REQUEST, msg),
            _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        })?;

    let accept_url = format!("{}/invitations/{}", state.base_url, token);
    state
        .mailer
        .send_org_invitation(
            &organization.slug,
            &payload.email,
            &accept_url,
            payload.role,
            user.username.as_deref(),
        )
        .await;

    Ok((
        StatusCode::CREATED,
        Json(CreateInvitationResponse { invitation }),
    ))
}

pub async fn list_invitations(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<String>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let user = ctx.user;
    let organization = ctx.organization;
    if organization.id != org_id {
        return Err(ErrorResponse::new(
            StatusCode::FORBIDDEN,
            "Organization mismatch",
        ));
    }

    let invitation_repo = InvitationRepository::new(&state.pool);

    let invitations = invitation_repo
        .list_invitations(&org_id, &user.id)
        .await
        .map_err(|e| match e {
            IdentityError::PermissionDenied => {
                ErrorResponse::new(StatusCode::FORBIDDEN, "Admin access required")
            }
            _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        })?;

    Ok(Json(ListInvitationsResponse { invitations }))
}

pub async fn get_invitation(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let invitation_repo = InvitationRepository::new(&state.pool);

    let invitation = invitation_repo
        .get_invitation_by_token(&token)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::NOT_FOUND, "Invitation not found"))?;

    let org_repo = OrganizationRepository::new(&state.pool);
    let org = org_repo
        .fetch_organization(&invitation.organization_id)
        .await
        .map_err(|_| {
            ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to fetch organization",
            )
        })?;

    Ok(Json(GetInvitationResponse {
        id: invitation.id,
        organization_slug: org.slug,
        role: invitation.role,
        expires_at: invitation.expires_at,
    }))
}

pub async fn accept_invitation(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(token): Path<String>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let user = ctx.user;
    let invitation_repo = InvitationRepository::new(&state.pool);

    let (org, role) = invitation_repo
        .accept_invitation(&token, &user.id)
        .await
        .map_err(|e| match e {
            IdentityError::InvitationError(msg) => ErrorResponse::new(StatusCode::BAD_REQUEST, msg),
            IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::NOT_FOUND, "Invitation not found")
            }
            _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        })?;

    Ok(Json(AcceptInvitationResponse {
        organization_id: org.id,
        organization_slug: org.slug,
        role,
    }))
}
