use axum::{Extension, Json};

use crate::{api::identity::IdentityResponse, auth::RequestContext};

pub async fn get_identity(Extension(ctx): Extension<RequestContext>) -> Json<IdentityResponse> {
    let user = ctx.user;
    Json(IdentityResponse {
        user_id: user.id,
        username: user.username,
        email: user.email,
    })
}
