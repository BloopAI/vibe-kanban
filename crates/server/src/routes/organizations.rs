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
    api::organizations::{
        CreateOrganizationRequest, CreateOrganizationResponse, GetOrganizationResponse,
        ListOrganizationsResponse, Organization, UpdateOrganizationRequest,
    },
    response::ApiResponse,
};
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/organizations", get(list_organizations))
        .route("/organizations", post(create_organization))
        .route("/organizations/:id", get(get_organization))
        .route("/organizations/:id", patch(update_organization))
        .route("/organizations/:id", delete(delete_organization))
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
        .list_organizations(&token)
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
        .get_organization(&token, id)
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
        .create_organization(&token, &request)
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
        .update_organization(&token, id, &request)
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
        .delete_organization(&token, id)
        .await
        .map_err(map_remote_error)?;

    Ok(StatusCode::NO_CONTENT)
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
            ApiError::Conflict(format!("Remote service error: {}", status))
        }
        e => {
            tracing::error!(?e, "Unexpected remote client error");
            ApiError::Conflict(format!("Failed to fetch organizations: {}", e))
        }
    }
}
