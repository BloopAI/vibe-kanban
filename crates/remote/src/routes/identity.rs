use axum::{Extension, Json, Router, routing::get};
use tracing::instrument;

use crate::{AppState, api::identity::IdentityResponse, auth::RequestContext};

pub fn router() -> Router<AppState> {
    Router::new().route("/identity", get(get_identity))
}

#[instrument(
    name = "identity.get_identity",
    skip(ctx),
    fields(org_id = %ctx.organization.id, user_id = %ctx.user.id)
)]
pub async fn get_identity(Extension(ctx): Extension<RequestContext>) -> Json<IdentityResponse> {
    let user = ctx.user;
    Json(IdentityResponse {
        user_id: user.id,
        username: user.username,
        email: user.email,
    })
}
