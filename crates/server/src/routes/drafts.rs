use axum::{
    Router,
    extract::{
        Query, State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
    routing::get,
};
use deployment::Deployment;
use futures_util::TryStreamExt;
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    ws_util::{WsKeepAlive, run_ws_stream},
};

#[derive(Debug, Deserialize)]
pub struct DraftsQuery {
    pub project_id: Uuid,
}

pub async fn stream_project_drafts_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<DraftsQuery>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_project_drafts_ws(socket, deployment, query.project_id).await {
            tracing::warn!("drafts WS closed: {}", e);
        }
    })
}

async fn handle_project_drafts_ws(
    socket: WebSocket,
    deployment: DeploymentImpl,
    project_id: Uuid,
) -> anyhow::Result<()> {
    let stream = deployment
        .events()
        .stream_drafts_for_project_raw(project_id)
        .await?
        .map_ok(|msg| msg.to_ws_message_unchecked());

    // Use run_ws_stream for proper keep-alive handling
    run_ws_stream(socket, stream, WsKeepAlive::for_list_streams()).await
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let inner = Router::new().route("/stream/ws", get(stream_project_drafts_ws));
    Router::new().nest("/drafts", inner)
}
