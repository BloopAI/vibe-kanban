use axum::{
    Router,
    extract::{Json, Path, State},
    http::StatusCode,
    response::Json as ResponseJson,
    routing::{delete, get, patch, post},
};
use deployment::Deployment;
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
    let client = deployment.remote_client()?;

    let response = client.list_projects(org_id).await?;

    Ok(ResponseJson(ApiResponse::success(response.projects)))
}

async fn list_organizations(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ListOrganizationsResponse>>, ApiError> {
    let client = deployment.remote_client()?;

    let response = client.list_organizations().await?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn get_organization(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<GetOrganizationResponse>>, ApiError> {
    let client = deployment.remote_client()?;

    let response = client.get_organization(id).await?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn create_organization(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateOrganizationRequest>,
) -> Result<ResponseJson<ApiResponse<CreateOrganizationResponse>>, ApiError> {
    let client = deployment.remote_client()?;

    let response = client.create_organization(&request).await?;

    deployment
        .track_if_analytics_allowed(
            "organization_created",
            serde_json::json!({
                "org_id": response.organization.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn update_organization(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
    Json(request): Json<UpdateOrganizationRequest>,
) -> Result<ResponseJson<ApiResponse<Organization>>, ApiError> {
    let client = deployment.remote_client()?;

    let response = client.update_organization(id, &request).await?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn delete_organization(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    let client = deployment.remote_client()?;

    client.delete_organization(id).await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn create_invitation(
    State(deployment): State<DeploymentImpl>,
    Path(org_id): Path<Uuid>,
    Json(request): Json<CreateInvitationRequest>,
) -> Result<ResponseJson<ApiResponse<CreateInvitationResponse>>, ApiError> {
    let client = deployment.remote_client()?;

    let response = client.create_invitation(org_id, &request).await?;

    deployment
        .track_if_analytics_allowed(
            "invitation_created",
            serde_json::json!({
                "invitation_id": response.invitation.id.to_string(),
                "org_id": org_id.to_string(),
                "role": response.invitation.role,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn list_invitations(
    State(deployment): State<DeploymentImpl>,
    Path(org_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<ListInvitationsResponse>>, ApiError> {
    let client = deployment.remote_client()?;

    let response = client.list_invitations(org_id).await?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn get_invitation(
    State(deployment): State<DeploymentImpl>,
    Path(token): Path<String>,
) -> Result<ResponseJson<ApiResponse<GetInvitationResponse>>, ApiError> {
    let client = deployment.remote_client()?;

    let response = client.get_invitation(&token).await?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn revoke_invitation(
    State(deployment): State<DeploymentImpl>,
    Path(org_id): Path<Uuid>,
    Json(payload): Json<RevokeInvitationRequest>,
) -> Result<StatusCode, ApiError> {
    let client = deployment.remote_client()?;

    client
        .revoke_invitation(org_id, payload.invitation_id)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn accept_invitation(
    State(deployment): State<DeploymentImpl>,
    Path(invitation_token): Path<String>,
) -> Result<ResponseJson<ApiResponse<AcceptInvitationResponse>>, ApiError> {
    let client = deployment.remote_client()?;

    let response = client.accept_invitation(&invitation_token).await?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn list_members(
    State(deployment): State<DeploymentImpl>,
    Path(org_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<ListMembersResponse>>, ApiError> {
    let client = deployment.remote_client()?;

    let response = client.list_members(org_id).await?;

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn remove_member(
    State(deployment): State<DeploymentImpl>,
    Path((org_id, user_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, ApiError> {
    let client = deployment.remote_client()?;

    client.remove_member(org_id, user_id).await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn update_member_role(
    State(deployment): State<DeploymentImpl>,
    Path((org_id, user_id)): Path<(Uuid, Uuid)>,
    Json(request): Json<UpdateMemberRoleRequest>,
) -> Result<ResponseJson<ApiResponse<UpdateMemberRoleResponse>>, ApiError> {
    let client = deployment.remote_client()?;

    let response = client.update_member_role(org_id, user_id, &request).await?;

    Ok(ResponseJson(ApiResponse::success(response)))
}
