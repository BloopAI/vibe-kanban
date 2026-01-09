use axum::{
    Extension, Json, Router,
    extract::{Path, Query, State},
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::user_registration::{CreateUserRegistration, RegistrationStatus, UserRegistration};
use deployment::Deployment;
use serde::Deserialize;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::auth::ClerkUser};

/// Query params for listing registrations
#[derive(Debug, Deserialize)]
pub struct ListRegistrationsQuery {
    pub status: Option<String>,
}

/// Get current user's registration status by Clerk user ID
/// For existing team members without a registration, auto-create an approved registration
pub async fn get_my_registration(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
) -> Result<ResponseJson<ApiResponse<Option<UserRegistration>>>, ApiError> {
    // First check for existing registration
    let registration =
        UserRegistration::find_by_clerk_id(&deployment.db().pool, &user.user_id).await?;

    if registration.is_some() {
        return Ok(ResponseJson(ApiResponse::success(registration)));
    }

    // No registration - check if user is already a team member (existing user before registration system)
    let existing_member = sqlx::query!(
        r#"SELECT tm.id, t.name as team_name
           FROM team_members tm
           JOIN teams t ON t.id = tm.team_id
           WHERE tm.clerk_user_id = $1
           LIMIT 1"#,
        &user.user_id
    )
    .fetch_optional(&deployment.db().pool)
    .await?;

    if let Some(member) = existing_member {
        // Existing team member - auto-create an approved registration
        let auto_registration = CreateUserRegistration {
            clerk_user_id: user.user_id.clone(),
            email: user.email.clone().unwrap_or_default(),
            first_name: None, // Will be populated from Clerk on next login
            last_name: None,
            workspace_name: member.team_name,
            planned_teams: Some(1),
            planned_projects: Some(3),
        };

        // Create the registration as auto-approved
        let new_registration =
            UserRegistration::create_auto_approved(&deployment.db().pool, &auto_registration)
                .await?;

        return Ok(ResponseJson(ApiResponse::success(Some(new_registration))));
    }

    // No registration and not an existing team member
    Ok(ResponseJson(ApiResponse::success(None)))
}

/// Create a new user registration
pub async fn create_registration(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Json(mut payload): Json<CreateUserRegistration>,
) -> Result<ResponseJson<ApiResponse<UserRegistration>>, ApiError> {
    // Ensure the clerk_user_id matches the authenticated user
    payload.clerk_user_id = user.user_id.clone();

    // Check if user already has a registration
    let existing =
        UserRegistration::find_by_clerk_id(&deployment.db().pool, &user.user_id).await?;
    if existing.is_some() {
        return Err(ApiError::BadRequest(
            "User already has a registration".to_string(),
        ));
    }

    let registration = UserRegistration::create(&deployment.db().pool, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "user_registration_created",
            serde_json::json!({
                "registration_id": registration.id.to_string(),
                "workspace_name": registration.workspace_name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(registration)))
}

/// List all registrations (admin only - for now, list pending registrations)
pub async fn list_registrations(
    State(deployment): State<DeploymentImpl>,
    Query(params): Query<ListRegistrationsQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<UserRegistration>>>, ApiError> {
    let registrations = match &params.status {
        None => {
            // Default to pending registrations when no status filter provided
            UserRegistration::list_pending(&deployment.db().pool).await?
        }
        Some(status_str) => {
            let status_filter = status_str.parse::<RegistrationStatus>().ok();
            UserRegistration::list_all(&deployment.db().pool, status_filter).await?
        }
    };

    Ok(ResponseJson(ApiResponse::success(registrations)))
}

/// Get a single registration by ID
pub async fn get_registration(
    State(deployment): State<DeploymentImpl>,
    Path(registration_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<UserRegistration>>, ApiError> {
    let registration = UserRegistration::find_by_id(&deployment.db().pool, registration_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Registration not found".to_string()))?;

    Ok(ResponseJson(ApiResponse::success(registration)))
}

/// Approve a user registration
pub async fn approve_registration(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Path(registration_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<UserRegistration>>, ApiError> {
    // For now, we need a reviewer ID. In a full implementation, we'd look up the
    // team member ID for the admin user. For simplicity, we'll use a placeholder
    // or skip this check for now.

    // Try to find the admin's team member ID (they should be an owner somewhere)
    let reviewer_id = find_admin_member_id(&deployment, &user.user_id).await?;

    let registration =
        UserRegistration::approve(&deployment.db().pool, registration_id, reviewer_id).await?;

    deployment
        .track_if_analytics_allowed(
            "user_registration_approved",
            serde_json::json!({
                "registration_id": registration_id.to_string(),
                "reviewer_user_id": user.user_id,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(registration)))
}

/// Reject a user registration
#[derive(Debug, Deserialize)]
pub struct RejectRequest {
    pub reason: Option<String>,
}

pub async fn reject_registration(
    State(deployment): State<DeploymentImpl>,
    Extension(user): Extension<ClerkUser>,
    Path(registration_id): Path<Uuid>,
    Json(payload): Json<RejectRequest>,
) -> Result<ResponseJson<ApiResponse<UserRegistration>>, ApiError> {
    let reviewer_id = find_admin_member_id(&deployment, &user.user_id).await?;

    let registration = UserRegistration::reject(
        &deployment.db().pool,
        registration_id,
        reviewer_id,
        payload.reason.as_deref(),
    )
    .await?;

    deployment
        .track_if_analytics_allowed(
            "user_registration_rejected",
            serde_json::json!({
                "registration_id": registration_id.to_string(),
                "reviewer_user_id": user.user_id,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(registration)))
}

/// Helper to find the team member ID for an admin user
/// Returns the first team member ID where the user has owner role
async fn find_admin_member_id(
    deployment: &DeploymentImpl,
    clerk_user_id: &str,
) -> Result<Uuid, ApiError> {
    // Query to find a team member with owner role for this clerk user
    let result = sqlx::query!(
        r#"SELECT id as "id!: uuid::Uuid"
           FROM team_members
           WHERE clerk_user_id = $1 AND role = 'owner'
           LIMIT 1"#,
        clerk_user_id
    )
    .fetch_optional(&deployment.db().pool)
    .await?;

    result
        .map(|r| r.id)
        .ok_or_else(|| ApiError::Forbidden("Only team owners can review registrations".to_string()))
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/", get(list_registrations).post(create_registration))
        .route("/me", get(get_my_registration))
        .route("/{registration_id}", get(get_registration))
        .route("/{registration_id}/approve", post(approve_registration))
        .route("/{registration_id}/reject", post(reject_registration))
}
