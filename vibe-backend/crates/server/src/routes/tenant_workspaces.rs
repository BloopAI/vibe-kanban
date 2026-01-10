use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{get, put},
    Router,
};
use db::models::tenant_workspace::{
    AddWorkspaceMember, CreateTenantWorkspace, TenantWorkspace, TenantWorkspaceMember,
    TenantWorkspaceError, UpdateTenantWorkspace, UpdateWorkspaceMemberRole, WorkspaceMemberRole,
};
use deployment::Deployment;
use serde::Deserialize;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{error::ApiError, DeploymentImpl};

/// Query params for listing workspaces
#[derive(Debug, Deserialize)]
pub struct ListWorkspacesQuery {
    pub user_id: String,
}

/// Query params for ensuring default workspace
#[derive(Debug, Deserialize)]
pub struct EnsureDefaultQuery {
    pub user_id: String,
    pub email: String,
}

/// List all workspaces for a user
pub async fn list_workspaces(
    State(deployment): State<DeploymentImpl>,
    axum::extract::Query(params): axum::extract::Query<ListWorkspacesQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<TenantWorkspace>>>, ApiError> {
    let workspaces =
        TenantWorkspace::find_all_for_user(&deployment.db().pool, &params.user_id).await?;
    Ok(ResponseJson(ApiResponse::success(workspaces)))
}

/// Ensure user is in default workspace and return all workspaces
/// This is called when a user has no workspaces (e.g., first login or missing membership)
pub async fn ensure_default_workspace(
    State(deployment): State<DeploymentImpl>,
    axum::extract::Query(params): axum::extract::Query<EnsureDefaultQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<TenantWorkspace>>>, ApiError> {
    // Find or create the default "iKanban" workspace
    let default_workspace = TenantWorkspace::find_or_create_default(&deployment.db().pool).await?;

    // Ensure user is a member of the default workspace
    TenantWorkspace::ensure_user_is_member(
        &deployment.db().pool,
        default_workspace.id,
        &params.user_id,
        &params.email,
    )
    .await?;

    // Return all workspaces the user now belongs to
    let workspaces =
        TenantWorkspace::find_all_for_user(&deployment.db().pool, &params.user_id).await?;

    deployment
        .track_if_analytics_allowed(
            "tenant_workspace_ensure_default",
            serde_json::json!({
                "user_id": params.user_id,
                "workspace_id": default_workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(workspaces)))
}

/// Create a new workspace
pub async fn create_workspace(
    State(deployment): State<DeploymentImpl>,
    axum::extract::Query(params): axum::extract::Query<CreateWorkspaceQuery>,
    axum::extract::Json(payload): axum::extract::Json<CreateTenantWorkspace>,
) -> Result<(StatusCode, ResponseJson<ApiResponse<TenantWorkspace>>), ApiError> {
    let workspace = TenantWorkspace::create(
        &deployment.db().pool,
        &payload,
        &params.user_id,
        &params.email,
    )
    .await?;

    deployment
        .track_if_analytics_allowed(
            "tenant_workspace_created",
            serde_json::json!({
                "workspace_id": workspace.id.to_string(),
                "workspace_name": workspace.name,
            }),
        )
        .await;

    Ok((StatusCode::CREATED, ResponseJson(ApiResponse::success(workspace))))
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceQuery {
    pub user_id: String,
    pub email: String,
}

/// Get a workspace by ID
pub async fn get_workspace(
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
    axum::extract::Query(params): axum::extract::Query<UserQuery>,
) -> Result<ResponseJson<ApiResponse<TenantWorkspace>>, ApiError> {
    // Verify user is a member
    let is_member =
        TenantWorkspaceMember::is_member(&deployment.db().pool, workspace_id, &params.user_id)
            .await?;
    if !is_member {
        return Err(ApiError::Forbidden(
            "Not a member of this workspace".to_string(),
        ));
    }

    let workspace = TenantWorkspace::find_by_id(&deployment.db().pool, workspace_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Workspace not found".to_string()))?;

    Ok(ResponseJson(ApiResponse::success(workspace)))
}

#[derive(Debug, Deserialize)]
pub struct UserQuery {
    pub user_id: String,
}

/// Update a workspace
pub async fn update_workspace(
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
    axum::extract::Query(params): axum::extract::Query<UserQuery>,
    axum::extract::Json(payload): axum::extract::Json<UpdateTenantWorkspace>,
) -> Result<ResponseJson<ApiResponse<TenantWorkspace>>, ApiError> {
    // Verify user is owner or admin
    let role =
        TenantWorkspaceMember::get_role(&deployment.db().pool, workspace_id, &params.user_id)
            .await?;
    match role {
        Some(WorkspaceMemberRole::Owner) | Some(WorkspaceMemberRole::Admin) => {}
        _ => {
            return Err(ApiError::Forbidden(
                "Only owners and admins can update workspaces".to_string(),
            ))
        }
    }

    let workspace = TenantWorkspace::update(&deployment.db().pool, workspace_id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "tenant_workspace_updated",
            serde_json::json!({
                "workspace_id": workspace.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(workspace)))
}

/// Delete a workspace
pub async fn delete_workspace(
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
    axum::extract::Query(params): axum::extract::Query<UserQuery>,
) -> Result<StatusCode, ApiError> {
    // Only owners can delete
    let role =
        TenantWorkspaceMember::get_role(&deployment.db().pool, workspace_id, &params.user_id)
            .await?;
    if role != Some(WorkspaceMemberRole::Owner) {
        return Err(ApiError::Forbidden(
            "Only owners can delete workspaces".to_string(),
        ));
    }

    TenantWorkspace::delete(&deployment.db().pool, workspace_id).await?;

    deployment
        .track_if_analytics_allowed(
            "tenant_workspace_deleted",
            serde_json::json!({
                "workspace_id": workspace_id.to_string(),
            }),
        )
        .await;

    Ok(StatusCode::NO_CONTENT)
}

// ============================================================================
// Workspace Members Routes
// ============================================================================

/// List members of a workspace
pub async fn list_members(
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
    axum::extract::Query(params): axum::extract::Query<UserQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<TenantWorkspaceMember>>>, ApiError> {
    // Verify user is a member
    let is_member =
        TenantWorkspaceMember::is_member(&deployment.db().pool, workspace_id, &params.user_id)
            .await?;
    if !is_member {
        return Err(ApiError::Forbidden(
            "Not a member of this workspace".to_string(),
        ));
    }

    let members =
        TenantWorkspaceMember::find_by_workspace(&deployment.db().pool, workspace_id).await?;
    Ok(ResponseJson(ApiResponse::success(members)))
}

/// Add a member to a workspace
pub async fn add_member(
    State(deployment): State<DeploymentImpl>,
    Path(workspace_id): Path<Uuid>,
    axum::extract::Query(params): axum::extract::Query<UserQuery>,
    axum::extract::Json(payload): axum::extract::Json<AddWorkspaceMember>,
) -> Result<(StatusCode, ResponseJson<ApiResponse<TenantWorkspaceMember>>), ApiError> {
    // Verify user is owner or admin
    let role =
        TenantWorkspaceMember::get_role(&deployment.db().pool, workspace_id, &params.user_id)
            .await?;
    match role {
        Some(WorkspaceMemberRole::Owner) | Some(WorkspaceMemberRole::Admin) => {}
        _ => {
            return Err(ApiError::Forbidden(
                "Only owners and admins can add members".to_string(),
            ))
        }
    }

    let member = TenantWorkspaceMember::add(&deployment.db().pool, workspace_id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "tenant_workspace_member_added",
            serde_json::json!({
                "workspace_id": workspace_id.to_string(),
                "member_email": payload.email,
            }),
        )
        .await;

    Ok((StatusCode::CREATED, ResponseJson(ApiResponse::success(member))))
}

/// Update a member's role
pub async fn update_member_role(
    State(deployment): State<DeploymentImpl>,
    Path((workspace_id, target_user_id)): Path<(Uuid, String)>,
    axum::extract::Query(params): axum::extract::Query<UserQuery>,
    axum::extract::Json(payload): axum::extract::Json<UpdateWorkspaceMemberRole>,
) -> Result<ResponseJson<ApiResponse<TenantWorkspaceMember>>, ApiError> {
    // Only owners can change roles
    let role =
        TenantWorkspaceMember::get_role(&deployment.db().pool, workspace_id, &params.user_id)
            .await?;
    if role != Some(WorkspaceMemberRole::Owner) {
        return Err(ApiError::Forbidden(
            "Only owners can change member roles".to_string(),
        ));
    }

    let member = TenantWorkspaceMember::update_role(
        &deployment.db().pool,
        workspace_id,
        &target_user_id,
        payload.role,
    )
    .await?;

    deployment
        .track_if_analytics_allowed(
            "tenant_workspace_member_role_updated",
            serde_json::json!({
                "workspace_id": workspace_id.to_string(),
                "target_user_id": target_user_id,
                "new_role": payload.role.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(member)))
}

/// Remove a member from a workspace
pub async fn remove_member(
    State(deployment): State<DeploymentImpl>,
    Path((workspace_id, target_user_id)): Path<(Uuid, String)>,
    axum::extract::Query(params): axum::extract::Query<UserQuery>,
) -> Result<StatusCode, ApiError> {
    // Owner/admin can remove others, anyone can remove themselves
    let role =
        TenantWorkspaceMember::get_role(&deployment.db().pool, workspace_id, &params.user_id)
            .await?;
    let is_self = params.user_id == target_user_id;
    let is_admin = matches!(
        role,
        Some(WorkspaceMemberRole::Owner) | Some(WorkspaceMemberRole::Admin)
    );

    if !is_self && !is_admin {
        return Err(ApiError::Forbidden(
            "Only owners and admins can remove other members".to_string(),
        ));
    }

    TenantWorkspaceMember::remove(&deployment.db().pool, workspace_id, &target_user_id).await?;

    deployment
        .track_if_analytics_allowed(
            "tenant_workspace_member_removed",
            serde_json::json!({
                "workspace_id": workspace_id.to_string(),
                "target_user_id": target_user_id,
            }),
        )
        .await;

    Ok(StatusCode::NO_CONTENT)
}

// ============================================================================
// Error Conversion
// ============================================================================

impl From<TenantWorkspaceError> for ApiError {
    fn from(err: TenantWorkspaceError) -> Self {
        match err {
            TenantWorkspaceError::Database(e) => ApiError::Database(e),
            TenantWorkspaceError::NotFound => ApiError::NotFound("Workspace not found".to_string()),
            TenantWorkspaceError::SlugConflict => {
                ApiError::BadRequest("Workspace slug already in use".to_string())
            }
            TenantWorkspaceError::NotMember => {
                ApiError::Forbidden("Not a member of this workspace".to_string())
            }
            TenantWorkspaceError::InsufficientPermissions => {
                ApiError::Forbidden("Insufficient permissions".to_string())
            }
        }
    }
}

// ============================================================================
// Router
// ============================================================================

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        // Workspace routes
        .route(
            "/tenant-workspaces",
            get(list_workspaces).post(create_workspace),
        )
        .route(
            "/tenant-workspaces/ensure-default",
            axum::routing::post(ensure_default_workspace),
        )
        .route(
            "/tenant-workspaces/{workspace_id}",
            get(get_workspace)
                .put(update_workspace)
                .delete(delete_workspace),
        )
        // Member routes
        .route(
            "/tenant-workspaces/{workspace_id}/members",
            get(list_members).post(add_member),
        )
        .route(
            "/tenant-workspaces/{workspace_id}/members/{target_user_id}",
            put(update_member_role).delete(remove_member),
        )
}
