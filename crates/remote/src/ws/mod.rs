use axum::{
    Router,
    extract::{Extension, Query, State, ws::WebSocketUpgrade},
    response::IntoResponse,
    routing::get,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{AppState, auth::RequestContext};

pub mod message;
mod session;

#[derive(Debug, Deserialize, Clone)]
pub struct WsQueryParams {
    pub project_id: Uuid,
    pub cursor: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/ws", get(upgrade))
}

async fn upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(params): Query<WsQueryParams>,
) -> impl IntoResponse {
    match crate::routes::organization_members::ensure_project_access(
        state.pool(),
        ctx.user.id,
        params.project_id,
    )
    .await
    {
        Ok(_) => ws.on_upgrade(move |socket| session::handle(socket, state, ctx, params)),
        Err(error) => error.into_response(),
    }
}
