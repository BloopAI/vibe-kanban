use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, patch, post},
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tracing::warn;
use utils::api::organizations::{
    ListMembersResponse, OrganizationMemberWithProfile, RevokeInvitationRequest,
    UpdateMemberRoleRequest, UpdateMemberRoleResponse,
};
use uuid::Uuid;

use super::error::{ErrorResponse, membership_error};
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        identity_errors::IdentityError,
        invitations::{Invitation, InvitationRepository},
        organization_members::{self, MemberRole},
        organizations::OrganizationRepository,
        projects::ProjectRepository,
        tasks::SharedTaskRepository,
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
        .route(
            "/organizations/{org_id}/invitations/revoke",
            post(revoke_invitation),
        )
        .route("/invitations/{token}/accept", post(accept_invitation))
        .route("/organizations/{org_id}/members", get(list_members))
        .route(
            "/organizations/{org_id}/members/{user_id}",
            delete(remove_member),
        )
        .route(
            "/organizations/{org_id}/members/{user_id}/role",
            patch(update_member_role),
        )
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
    pub organization_name: String,
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
    Path(org_id): Path<Uuid>,
    Json(payload): Json<CreateInvitationRequest>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let user = ctx.user;
    let org_repo = OrganizationRepository::new(&state.pool);
    let invitation_repo = InvitationRepository::new(&state.pool);

    ensure_admin_access(&state.pool, org_id, user.id).await?;

    let token = Uuid::new_v4().to_string();
    let expires_at = Utc::now() + Duration::days(7);

    let invitation = invitation_repo
        .create_invitation(
            org_id,
            user.id,
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

    let organization = org_repo.fetch_organization(org_id).await.map_err(|_| {
        ErrorResponse::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to fetch organization",
        )
    })?;

    let accept_url = format!(
        "{}/invitations/{}/accept",
        state.server_public_base_url, token
    );
    state
        .mailer
        .send_org_invitation(
            &organization.name,
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
    Path(org_id): Path<Uuid>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let user = ctx.user;
    let invitation_repo = InvitationRepository::new(&state.pool);

    ensure_admin_access(&state.pool, org_id, user.id).await?;

    let invitations = invitation_repo
        .list_invitations(org_id, user.id)
        .await
        .map_err(|e| match e {
            IdentityError::PermissionDenied => {
                ErrorResponse::new(StatusCode::FORBIDDEN, "Admin access required")
            }
            IdentityError::InvitationError(msg) => ErrorResponse::new(StatusCode::BAD_REQUEST, msg),
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
        .fetch_organization(invitation.organization_id)
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
        organization_name: org.name,
        role: invitation.role,
        expires_at: invitation.expires_at,
    }))
}

pub async fn revoke_invitation(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<Uuid>,
    Json(payload): Json<RevokeInvitationRequest>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let user = ctx.user;
    let invitation_repo = InvitationRepository::new(&state.pool);

    ensure_admin_access(&state.pool, org_id, user.id).await?;

    invitation_repo
        .revoke_invitation(org_id, payload.invitation_id, user.id)
        .await
        .map_err(|e| match e {
            IdentityError::PermissionDenied => {
                ErrorResponse::new(StatusCode::FORBIDDEN, "Admin access required")
            }
            IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::NOT_FOUND, "Invitation not found")
            }
            _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        })?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn accept_invitation(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(token): Path<String>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let user = ctx.user;
    let invitation_repo = InvitationRepository::new(&state.pool);

    let (org, role) = invitation_repo
        .accept_invitation(&token, user.id)
        .await
        .map_err(|e| match e {
            IdentityError::InvitationError(msg) => ErrorResponse::new(StatusCode::BAD_REQUEST, msg),
            IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::NOT_FOUND, "Invitation not found")
            }
            _ => ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
        })?;

    Ok(Json(AcceptInvitationResponse {
        organization_id: org.id.to_string(),
        organization_slug: org.slug,
        role,
    }))
}

pub async fn list_members(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path(org_id): Path<Uuid>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let user = ctx.user;
    ensure_member_access(&state.pool, org_id, user.id).await?;

    let members = sqlx::query_as!(
        OrganizationMemberWithProfile,
        r#"
        SELECT
            omm.user_id AS "user_id!: Uuid",
            omm.role AS "role!: MemberRole",
            omm.joined_at AS "joined_at!",
            u.first_name AS "first_name?",
            u.last_name AS "last_name?",
            u.username AS "username?",
            u.email AS "email?",
            oa.avatar_url AS "avatar_url?"
        FROM organization_member_metadata omm
        INNER JOIN users u ON omm.user_id = u.id
        LEFT JOIN LATERAL (
            SELECT avatar_url
            FROM oauth_accounts
            WHERE user_id = omm.user_id
            ORDER BY created_at ASC
            LIMIT 1
        ) oa ON true
        WHERE omm.organization_id = $1
        ORDER BY omm.joined_at ASC
        "#,
        org_id
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    Ok(Json(ListMembersResponse { members }))
}

pub async fn remove_member(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path((org_id, user_id)): Path<(Uuid, Uuid)>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let user = ctx.user;
    if user.id == user_id {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Cannot remove yourself",
        ));
    }

    let org_repo = OrganizationRepository::new(&state.pool);
    if org_repo
        .is_personal(org_id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::NOT_FOUND, "Organization not found"))?
    {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Cannot modify members of a personal organization",
        ));
    }

    ensure_admin_access(&state.pool, org_id, user.id).await?;

    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let target = sqlx::query!(
        r#"
        SELECT role AS "role!: MemberRole"
        FROM organization_member_metadata
        WHERE organization_id = $1 AND user_id = $2
        FOR UPDATE
        "#,
        org_id,
        user_id
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
    .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "Member not found"))?;

    if target.role == MemberRole::Admin {
        let admin_ids = sqlx::query_scalar!(
            r#"
            SELECT user_id
            FROM organization_member_metadata
            WHERE organization_id = $1 AND role = 'admin'
            FOR UPDATE
            "#,
            org_id
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

        if admin_ids.len() == 1 && admin_ids[0] == user_id {
            return Err(ErrorResponse::new(
                StatusCode::CONFLICT,
                "Cannot remove the last admin",
            ));
        }
    }

    sqlx::query!(
        r#"
        DELETE FROM organization_member_metadata
        WHERE organization_id = $1 AND user_id = $2
        "#,
        org_id,
        user_id
    )
    .execute(&mut *tx)
    .await
    .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    tx.commit()
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn update_member_role(
    State(state): State<AppState>,
    axum::extract::Extension(ctx): axum::extract::Extension<RequestContext>,
    Path((org_id, user_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateMemberRoleRequest>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let user = ctx.user;
    if user.id == user_id && payload.role == MemberRole::Member {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Cannot demote yourself",
        ));
    }

    let org_repo = OrganizationRepository::new(&state.pool);
    if org_repo
        .is_personal(org_id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::NOT_FOUND, "Organization not found"))?
    {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Cannot modify members of a personal organization",
        ));
    }

    ensure_admin_access(&state.pool, org_id, user.id).await?;

    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let target = sqlx::query!(
        r#"
        SELECT role AS "role!: MemberRole"
        FROM organization_member_metadata
        WHERE organization_id = $1 AND user_id = $2
        FOR UPDATE
        "#,
        org_id,
        user_id
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
    .ok_or_else(|| ErrorResponse::new(StatusCode::NOT_FOUND, "Member not found"))?;

    if target.role == payload.role {
        return Ok(Json(UpdateMemberRoleResponse {
            user_id,
            role: payload.role,
        }));
    }

    if target.role == MemberRole::Admin && payload.role == MemberRole::Member {
        let admin_ids = sqlx::query_scalar!(
            r#"
            SELECT user_id
            FROM organization_member_metadata
            WHERE organization_id = $1 AND role = 'admin'
            FOR UPDATE
            "#,
            org_id
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

        if admin_ids.len() == 1 && admin_ids[0] == user_id {
            return Err(ErrorResponse::new(
                StatusCode::CONFLICT,
                "Cannot demote the last admin",
            ));
        }
    }

    sqlx::query!(
        r#"
        UPDATE organization_member_metadata
        SET role = $3
        WHERE organization_id = $1 AND user_id = $2
        "#,
        org_id,
        user_id,
        payload.role as MemberRole
    )
    .execute(&mut *tx)
    .await
    .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    tx.commit()
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    Ok(Json(UpdateMemberRoleResponse {
        user_id,
        role: payload.role,
    }))
}

pub(crate) async fn ensure_member_access(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), ErrorResponse> {
    organization_members::assert_membership(pool, organization_id, user_id)
        .await
        .map_err(|err| membership_error(err, "Not a member of organization"))
}

pub(crate) async fn ensure_admin_access(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), ErrorResponse> {
    OrganizationRepository::new(pool)
        .assert_admin(organization_id, user_id)
        .await
        .map_err(|err| membership_error(err, "Admin access required"))
}

pub(crate) async fn ensure_project_access(
    pool: &PgPool,
    user_id: Uuid,
    project_id: Uuid,
) -> Result<Uuid, ErrorResponse> {
    let organization_id = ProjectRepository::organization_id(pool, project_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %project_id, "failed to load project");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?
        .ok_or_else(|| {
            warn!(
                %project_id,
                %user_id,
                "project not found for access check"
            );
            ErrorResponse::new(StatusCode::NOT_FOUND, "project not found")
        })?;

    organization_members::assert_membership(pool, organization_id, user_id)
        .await
        .map_err(|err| {
            if let IdentityError::Database(error) = &err {
                tracing::error!(
                    ?error,
                    %organization_id,
                    %project_id,
                    "failed to authorize project membership"
                );
            } else {
                warn!(
                    ?err,
                    %organization_id,
                    %project_id,
                    %user_id,
                    "project access denied"
                );
            }
            membership_error(err, "project not accessible")
        })?;

    Ok(organization_id)
}

pub(crate) async fn ensure_task_access(
    pool: &PgPool,
    user_id: Uuid,
    task_id: Uuid,
) -> Result<Uuid, ErrorResponse> {
    let organization_id = SharedTaskRepository::organization_id(pool, task_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, %task_id, "failed to load shared task");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
        })?
        .ok_or_else(|| {
            warn!(
                %task_id,
                %user_id,
                "shared task not found for access check"
            );
            ErrorResponse::new(StatusCode::NOT_FOUND, "shared task not found")
        })?;

    organization_members::assert_membership(pool, organization_id, user_id)
        .await
        .map_err(|err| {
            if let IdentityError::Database(error) = &err {
                tracing::error!(
                    ?error,
                    %organization_id,
                    %task_id,
                    "failed to authorize shared task access"
                );
            } else {
                warn!(
                    ?err,
                    %organization_id,
                    %task_id,
                    %user_id,
                    "shared task access denied"
                );
            }
            membership_error(err, "task not accessible")
        })?;

    Ok(organization_id)
}
