use axum::{Extension, Json};
use tracing::instrument;

use crate::{api::identity::IdentityResponse, auth::RequestContext};

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
