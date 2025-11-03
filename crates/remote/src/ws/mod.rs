use axum::{
    Router,
    extract::{Extension, Query, State, ws::WebSocketUpgrade},
    response::IntoResponse,
    routing::get,
};
use serde::Deserialize;

use crate::{AppState, auth::RequestContext};

pub mod message;
mod session;

#[derive(Debug, Deserialize, Clone)]
pub struct WsQueryParams {
    pub cursor: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/v1/ws", get(upgrade))
}

async fn upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Query(params): Query<WsQueryParams>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| session::handle(socket, state, ctx, params))
}
