use axum::{
    Json, Router,
    extract::{Extension, State},
    http::StatusCode,
    routing::get,
};
use relay_types::ListRelayHostsResponse;

use super::error::ErrorResponse;
use crate::{AppState, auth::RequestContext, db::hosts::HostRepository};

pub fn router() -> Router<AppState> {
    Router::new().route("/hosts", get(list_hosts))
}

async fn list_hosts(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<ListRelayHostsResponse>, ErrorResponse> {
    let repo = HostRepository::new(state.pool());
    let hosts = repo
        .list_accessible_hosts(ctx.user.id)
        .await
        .map_err(|error| {
            tracing::warn!(?error, "failed to list relay hosts");
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to list hosts")
        })?;

    Ok(Json(ListRelayHostsResponse { hosts }))
}
