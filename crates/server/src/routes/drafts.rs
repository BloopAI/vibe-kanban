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
use futures_util::{SinkExt, StreamExt, TryStreamExt};
use serde::Deserialize;
use uuid::Uuid;

use crate::DeploymentImpl;

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
    let mut stream = deployment
        .events()
        .stream_drafts_for_project_raw(project_id)
        .await?
        .map_ok(|msg| msg.to_ws_message_unchecked());

    let (mut sender, mut receiver) = socket.split();
    tokio::spawn(async move { while let Some(Ok(_)) = receiver.next().await {} });

    while let Some(item) = stream.next().await {
        match item {
            Ok(msg) => {
                if sender.send(msg).await.is_err() {
                    break;
                }
            }
            Err(e) => {
                tracing::error!("stream error: {}", e);
                break;
            }
        }
    }
    Ok(())
}

pub fn router(_deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let inner = Router::new().route("/stream/ws", get(stream_project_drafts_ws));
    Router::new().nest("/drafts", inner)
}
