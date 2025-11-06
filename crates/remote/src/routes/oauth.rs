use axum::{
    Json,
    extract::{Extension, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use secrecy::ExposeSecret;
use tracing::instrument;

use super::error::clerk_token_error_response;
use crate::{AppState, api::oauth::GitHubTokenResponse, auth::RequestContext};

#[instrument(
    name = "oauth.github_token",
    skip(state, ctx),
    fields(user_id = %ctx.user.id, org_id = %ctx.organization.id)
)]
pub async fn github_token(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Response {
    match state
        .clerk()
        .get_oauth_access_token(&ctx.user.id, "oauth_github")
        .await
    {
        Ok(token) => {
            let response = GitHubTokenResponse {
                access_token: token.token.expose_secret().to_owned(),
                expires_at: token.expires_at,
                scopes: token.scopes.unwrap_or_default(),
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(err) => clerk_token_error_response(err),
    }
}
