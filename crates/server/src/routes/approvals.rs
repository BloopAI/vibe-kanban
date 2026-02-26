use axum::{
    Router,
    extract::{State, ws::Message},
    http::StatusCode,
    response::{IntoResponse, Json as ResponseJson},
    routing::{get, post},
};
use deployment::Deployment;
use futures_util::StreamExt;
use utils::{
    approvals::{ApprovalOutcome, ApprovalResponse},
    log_msg::LogMsg,
    response::ApiResponse,
};

use crate::{
    DeploymentImpl,
    routes::relay_ws::{SignedWebSocket, SignedWsUpgrade},
};

pub async fn respond_to_approval(
    State(deployment): State<DeploymentImpl>,
    axum::extract::Path(id): axum::extract::Path<String>,
    ResponseJson(request): ResponseJson<ApprovalResponse>,
) -> Result<ResponseJson<ApiResponse<ApprovalOutcome>>, StatusCode> {
    let service = deployment.approvals();

    match service.respond(&id, request).await {
        Ok((outcome, context)) => {
            deployment
                .track_if_analytics_allowed(
                    "approval_responded",
                    serde_json::json!({
                        "approval_id": &id,
                        "status": format!("{:?}", outcome),
                        "tool_name": context.tool_name,
                        "execution_process_id": context.execution_process_id.to_string(),
                    }),
                )
                .await;

            Ok(ResponseJson(ApiResponse::success(outcome)))
        }
        Err(e) => {
            tracing::error!("Failed to respond to approval: {:?}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn stream_approvals_ws(
    ws: SignedWsUpgrade,
    State(deployment): State<DeploymentImpl>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_approvals_ws(socket, deployment).await {
            tracing::warn!("approvals WS closed: {}", e);
        }
    })
}

async fn handle_approvals_ws(
    mut socket: SignedWebSocket,
    deployment: DeploymentImpl,
) -> anyhow::Result<()> {
    let mut stream = deployment.approvals().patch_stream();

    if let Some(snapshot_patch) = stream.next().await {
        socket
            .send(LogMsg::JsonPatch(snapshot_patch).to_ws_message_unchecked())
            .await?;
    } else {
        return Ok(());
    }
    socket.send(LogMsg::Ready.to_ws_message_unchecked()).await?;

    loop {
        tokio::select! {
            patch = stream.next() => {
                let Some(patch) = patch else {
                    break;
                };

                if socket
                    .send(LogMsg::JsonPatch(patch).to_ws_message_unchecked())
                    .await
                    .is_err()
                {
                    break;
                }
            }
            inbound = socket.recv() => {
                match inbound {
                    Ok(Some(Message::Close(_))) => break,
                    Ok(Some(_)) => {}
                    Ok(None) => break,
                    Err(error) => {
                        tracing::warn!("approvals WS receive error: {}", error);
                        break;
                    }
                }
            }
        }
    }

    Ok(())
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/approvals/{id}/respond", post(respond_to_approval))
        .route("/approvals/stream/ws", get(stream_approvals_ws))
}
