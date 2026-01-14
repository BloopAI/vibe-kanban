use axum::{Router, extract::State, response::Json as ResponseJson, routing::get};
use db::models::user::User;
use deployment::Deployment;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

/// List all users for the assignment picker
pub async fn list_users(
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<User>>>, ApiError> {
    let users = User::find_all(&deployment.db().pool).await?;
    Ok(ResponseJson(ApiResponse::success(users)))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new().route("/users", get(list_users))
}
