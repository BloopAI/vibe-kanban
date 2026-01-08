use axum::{
    extract::Path,
    response::Json as ResponseJson,
    routing::{delete, get, post},
    Json, Router,
};
use db::models::api_key::{ApiKey, ApiKeyInfo, ApiKeyWithSecret, CreateApiKey};
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    error::ApiError,
    middleware::auth::ClerkUser,
    DeploymentImpl,
};
use axum::extract::State;
use deployment::Deployment;


/// List all API keys for the current user
pub async fn list_api_keys(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<ApiKeyInfo>>>, ApiError> {
    let keys = ApiKey::find_by_user(&deployment.db().pool, &user.user_id).await?;
    Ok(ResponseJson(ApiResponse::success(keys)))
}

/// Create a new API key
pub async fn create_api_key(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateApiKey>,
) -> Result<ResponseJson<ApiResponse<ApiKeyWithSecret>>, ApiError> {
    let key = ApiKey::create(&deployment.db().pool, &user.user_id, &request).await?;
    Ok(ResponseJson(ApiResponse::success(key)))
}

/// Revoke an API key (soft delete)
pub async fn revoke_api_key(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path(key_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let success = ApiKey::revoke(&deployment.db().pool, key_id, &user.user_id).await?;
    if success {
        Ok(ResponseJson(ApiResponse::success(())))
    } else {
        Err(ApiError::NotFound("API key not found".to_string()))
    }
}

/// Delete an API key permanently
pub async fn delete_api_key(
    user: ClerkUser,
    State(deployment): State<DeploymentImpl>,
    Path(key_id): Path<Uuid>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let success = ApiKey::delete(&deployment.db().pool, key_id, &user.user_id).await?;
    if success {
        Ok(ResponseJson(ApiResponse::success(())))
    } else {
        Err(ApiError::NotFound("API key not found".to_string()))
    }
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/api-keys", get(list_api_keys))
        .route("/api-keys", post(create_api_key))
        .route("/api-keys/{key_id}/revoke", post(revoke_api_key))
        .route("/api-keys/{key_id}", delete(delete_api_key))
}
