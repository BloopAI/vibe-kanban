use axum::{
    Extension, Json, Router,
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tracing::instrument;
use utils::api::organizations::OrganizationWithRole;
use uuid::Uuid;

use crate::{AppState, auth::RequestContext, db::organizations::OrganizationRepository};

#[derive(Debug, Serialize, Deserialize)]
pub struct IdentityResponse {
    pub user_id: Uuid,
    pub username: Option<String>,
    pub email: String,
}

/// Response for /v1/me endpoint - everything needed for node setup
#[derive(Debug, Serialize)]
pub struct MeResponse {
    pub user: UserInfo,
    pub organizations: Vec<OrganizationWithRole>,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: Uuid,
    pub username: Option<String>,
    pub email: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/identity", get(get_identity))
        .route("/me", get(get_me))
}

#[instrument(name = "identity.get_identity", skip(ctx), fields(user_id = %ctx.user.id))]
pub async fn get_identity(Extension(ctx): Extension<RequestContext>) -> Json<IdentityResponse> {
    let user = ctx.user;
    Json(IdentityResponse {
        user_id: user.id,
        username: user.username,
        email: user.email,
    })
}

/// Get current user info and their organizations.
/// This endpoint provides everything needed to set up a node:
/// - User information
/// - List of organizations (use organization_id to create API keys)
#[instrument(name = "identity.get_me", skip(state, ctx), fields(user_id = %ctx.user.id))]
pub async fn get_me(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Response {
    let org_repo = OrganizationRepository::new(state.pool());

    let organizations = match org_repo.list_user_organizations(ctx.user.id).await {
        Ok(orgs) => orgs,
        Err(e) => {
            tracing::error!(?e, "Failed to list user organizations");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal_error", "message": "Failed to fetch organizations" })),
            )
                .into_response();
        }
    };

    Json(MeResponse {
        user: UserInfo {
            id: ctx.user.id,
            username: ctx.user.username.clone(),
            email: ctx.user.email.clone(),
        },
        organizations,
    })
    .into_response()
}
