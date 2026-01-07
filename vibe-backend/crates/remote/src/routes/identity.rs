use axum::{Extension, Json, Router, routing::get};
use serde::{Deserialize, Serialize};
use tracing::instrument;
use uuid::Uuid;

use crate::{AppState, auth::RequestContext};

#[derive(Debug, Serialize, Deserialize)]
pub struct IdentityResponse {
    pub user_id: Uuid,
    pub username: Option<String>,
    pub email: String,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/identity", get(get_identity))
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
