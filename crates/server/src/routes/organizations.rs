use axum::{
    Router,
    extract::{Json, Path, State},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{delete, get, patch, post},
};
use deployment::Deployment;
use services::services::remote_client::RemoteClientError;
use utils::{
    api::{
        organizations::{
            AcceptInvitationResponse, CreateInvitationRequest, CreateInvitationResponse,
            CreateOrganizationRequest, CreateOrganizationResponse, GetInvitationResponse,
            GetOrganizationResponse, ListInvitationsResponse, ListMembersResponse,
            ListOrganizationsResponse, Organization, RevokeInvitationRequest,
            UpdateMemberRoleRequest, UpdateMemberRoleResponse, UpdateOrganizationRequest,
        },
        projects::RemoteProject,
    },
    response::ApiResponse,
};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/organizations", get(list_organizations))
        .route("/organizations", post(create_organization))
        .route("/organizations/{id}", get(get_organization))
        .route("/organizations/{id}", patch(update_organization))
        .route("/organizations/{id}", delete(delete_organization))
        .route(
            "/organizations/{org_id}/projects",
            get(list_organization_projects),
        )
        .route(
            "/organizations/{org_id}/invitations",
            post(create_invitation),
        )
        .route("/organizations/{org_id}/invitations", get(list_invitations))
        .route(
            "/organizations/{org_id}/invitations/revoke",
            post(revoke_invitation),
        )
        .route("/invitations/{token}", get(get_invitation))
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

async fn list_organization_projects(
    State(deployment): State<DeploymentImpl>,
    Path(org_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<Vec<RemoteProject>>>, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let token = deployment
        .auth_context()
        .get_credentials()
        .await
        .ok_or_else(|| ApiError::Conflict("Not authenticated".to_string()))?
        .access_token;

    let response = remote_client
        .authenticated(&token)
        .list_projects(org_id)
        .await
        .map_err(map_remote_error)?;

    Ok(ResponseJson(ApiResponse::success(response.projects)))
}

async fn list_organizations(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ListOrganizationsResponse>>, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let token = deployment
        .auth_context()
        .get_credentials()
        .await
        .ok_or_else(|| ApiError::Conflict("Not authenticated".to_string()))?
        .access_token;

    let response = remote_client
        .authenticated(&token)
        .list_organizations()
        .await
        .map_err(map_remote_error)?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn get_organization(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<GetOrganizationResponse>>, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let token = deployment
        .auth_context()
        .get_credentials()
        .await
        .ok_or_else(|| ApiError::Conflict("Not authenticated".to_string()))?
        .access_token;

    let response = remote_client
        .authenticated(&token)
        .get_organization(id)
        .await
        .map_err(map_remote_error)?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn create_organization(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateOrganizationRequest>,
) -> Result<ResponseJson<ApiResponse<CreateOrganizationResponse>>, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let token = deployment
        .auth_context()
        .get_credentials()
        .await
        .ok_or_else(|| ApiError::Conflict("Not authenticated".to_string()))?
        .access_token;

    let response = remote_client
        .authenticated(&token)
        .create_organization(&request)
        .await
        .map_err(map_remote_error)?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn update_organization(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
    Json(request): Json<UpdateOrganizationRequest>,
) -> Result<ResponseJson<ApiResponse<Organization>>, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let token = deployment
        .auth_context()
        .get_credentials()
        .await
        .ok_or_else(|| ApiError::Conflict("Not authenticated".to_string()))?
        .access_token;

    let response = remote_client
        .authenticated(&token)
        .update_organization(id, &request)
        .await
        .map_err(map_remote_error)?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn delete_organization(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let token = deployment
        .auth_context()
        .get_credentials()
        .await
        .ok_or_else(|| ApiError::Conflict("Not authenticated".to_string()))?
        .access_token;

    remote_client
        .authenticated(&token)
        .delete_organization(id)
        .await
        .map_err(map_remote_error)?;

    Ok(StatusCode::NO_CONTENT)
}

async fn create_invitation(
    State(deployment): State<DeploymentImpl>,
    Path(org_id): Path<Uuid>,
    Json(request): Json<CreateInvitationRequest>,
) -> Result<ResponseJson<ApiResponse<CreateInvitationResponse>>, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let token = deployment
        .auth_context()
        .get_credentials()
        .await
        .ok_or_else(|| ApiError::Conflict("Not authenticated".to_string()))?
        .access_token;

    let response = remote_client
        .authenticated(&token)
        .create_invitation(org_id, &request)
        .await
        .map_err(map_remote_error)?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn list_invitations(
    State(deployment): State<DeploymentImpl>,
    Path(org_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<ListInvitationsResponse>>, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let token = deployment
        .auth_context()
        .get_credentials()
        .await
        .ok_or_else(|| ApiError::Conflict("Not authenticated".to_string()))?
        .access_token;

    let response = remote_client
        .authenticated(&token)
        .list_invitations(org_id)
        .await
        .map_err(map_remote_error)?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn get_invitation(
    State(deployment): State<DeploymentImpl>,
    Path(token): Path<String>,
) -> Result<ResponseJson<ApiResponse<GetInvitationResponse>>, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let response = remote_client
        .get_invitation(&token)
        .await
        .map_err(map_remote_error)?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn revoke_invitation(
    State(deployment): State<DeploymentImpl>,
    Path(org_id): Path<Uuid>,
    Json(payload): Json<RevokeInvitationRequest>,
) -> Result<StatusCode, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let token = deployment
        .auth_context()
        .get_credentials()
        .await
        .ok_or_else(|| ApiError::Conflict("Not authenticated".to_string()))?
        .access_token;

    remote_client
        .authenticated(&token)
        .revoke_invitation(org_id, payload.invitation_id)
        .await
        .map_err(map_remote_error)?;

    Ok(StatusCode::NO_CONTENT)
}

async fn accept_invitation(
    State(deployment): State<DeploymentImpl>,
    Path(invitation_token): Path<String>,
) -> Result<ResponseJson<ApiResponse<AcceptInvitationResponse>>, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let token = deployment
        .auth_context()
        .get_credentials()
        .await
        .ok_or_else(|| ApiError::Conflict("Not authenticated".to_string()))?
        .access_token;

    let response = remote_client
        .authenticated(&token)
        .accept_invitation(&invitation_token)
        .await
        .map_err(map_remote_error)?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn list_members(
    State(deployment): State<DeploymentImpl>,
    Path(org_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<ListMembersResponse>>, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let token = deployment
        .auth_context()
        .get_credentials()
        .await
        .ok_or_else(|| ApiError::Conflict("Not authenticated".to_string()))?
        .access_token;

    let response = remote_client
        .authenticated(&token)
        .list_members(org_id)
        .await
        .map_err(map_remote_error)?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn remove_member(
    State(deployment): State<DeploymentImpl>,
    Path((org_id, user_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let token = deployment
        .auth_context()
        .get_credentials()
        .await
        .ok_or_else(|| ApiError::Conflict("Not authenticated".to_string()))?
        .access_token;

    remote_client
        .authenticated(&token)
        .remove_member(org_id, user_id)
        .await
        .map_err(map_remote_error)?;

    Ok(StatusCode::NO_CONTENT)
}

async fn update_member_role(
    State(deployment): State<DeploymentImpl>,
    Path((org_id, user_id)): Path<(Uuid, Uuid)>,
    Json(request): Json<UpdateMemberRoleRequest>,
) -> Result<ResponseJson<ApiResponse<UpdateMemberRoleResponse>>, ApiError> {
    let remote_client = deployment
        .remote_client()
        .ok_or_else(|| ApiError::Conflict("OAuth remote client not configured".to_string()))?;

    let token = deployment
        .auth_context()
        .get_credentials()
        .await
        .ok_or_else(|| ApiError::Conflict("Not authenticated".to_string()))?
        .access_token;

    let response = remote_client
        .authenticated(&token)
        .update_member_role(org_id, user_id, &request)
        .await
        .map_err(map_remote_error)?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

fn map_remote_error(e: RemoteClientError) -> ApiError {
    match e {
        RemoteClientError::Auth => ApiError::Unauthorized,
        RemoteClientError::Http { status: 404, .. } => {
            ApiError::Conflict("Organization not found".to_string())
        }
        RemoteClientError::Transport(msg) => {
            ApiError::Conflict(format!("Remote service unavailable: {}", msg))
        }
        RemoteClientError::Timeout => ApiError::Conflict("Remote service timeout".to_string()),
        RemoteClientError::Http { status, body } => {
            tracing::error!(?status, ?body, "Remote API error");
            let error_message = serde_json::from_str::<serde_json::Value>(&body)
                .ok()
                .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(String::from))
                .unwrap_or(body);
            ApiError::Conflict(error_message)
        }
        e => {
            tracing::error!(?e, "Unexpected remote client error");
            ApiError::Conflict(format!("Failed to fetch organizations: {}", e))
        }
    }
}
