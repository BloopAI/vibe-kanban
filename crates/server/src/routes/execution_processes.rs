use std::pin::Pin;

use anyhow;
use axum::{
    Extension, Router,
    extract::{Path, Query, State, ws::Message},
    middleware::from_fn_with_state,
    response::{IntoResponse, Json as ResponseJson},
    routing::{get, post},
};
use db::models::{
    execution_process::{ExecutionProcess, ExecutionProcessStatus},
    execution_process_repo_state::ExecutionProcessRepoState,
};
use deployment::Deployment;
use futures_util::{StreamExt, TryStreamExt};
use json_patch::{Patch, PatchOperation};
use serde::Deserialize;
use services::services::container::ContainerService;
use tokio::time::{Duration, Sleep};
use utils::{log_msg::LogMsg, response::ApiResponse};
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    error::ApiError,
    middleware::{
        load_execution_process_middleware,
        signed_ws::{MaybeSignedWebSocket, SignedWsUpgrade},
    },
};

#[derive(Debug, Deserialize)]
struct SessionExecutionProcessQuery {
    pub session_id: Uuid,
    /// If true, include soft-deleted (dropped) processes in results/stream
    #[serde(default)]
    pub show_soft_deleted: Option<bool>,
}

async fn get_execution_process_by_id(
    Extension(execution_process): Extension<ExecutionProcess>,
    State(_deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

async fn stream_raw_logs_ws(
    ws: SignedWsUpgrade,
    State(deployment): State<DeploymentImpl>,
    Path(exec_id): Path<Uuid>,
) -> impl IntoResponse {
    // Always accept the WebSocket upgrade — handle "not found" inside the
    // connection by sending `finished` and closing cleanly, instead of
    // rejecting with HTTP 404 which the browser surfaces as an opaque
    // connection failure.
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_raw_logs_ws(socket, deployment, exec_id).await {
            tracing::warn!("raw logs WS closed: {}", e);
        }
    })
}

async fn handle_raw_logs_ws(
    mut socket: MaybeSignedWebSocket,
    deployment: DeploymentImpl,
    exec_id: Uuid,
) -> anyhow::Result<()> {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    use executors::logs::utils::patch::ConversationPatch;
    use utils::log_msg::LogMsg;

    // Get the raw stream — if not found, send finished and close cleanly
    let raw_stream = match deployment.container().stream_raw_logs(&exec_id).await {
        Some(stream) => stream,
        None => {
            // No logs available: send finished so the client gets a clean
            // close instead of retrying endlessly.
            let _ = socket
                .send(LogMsg::Finished.to_ws_message_unchecked())
                .await;
            let _ = socket.close().await;
            return Ok(());
        }
    };

    let counter = Arc::new(AtomicUsize::new(0));
    let mut stream = raw_stream.map_ok({
        let counter = counter.clone();
        move |m| match m {
            LogMsg::Stdout(content) => {
                let index = counter.fetch_add(1, Ordering::SeqCst);
                let patch = ConversationPatch::add_stdout(index, content);
                LogMsg::JsonPatch(patch).to_ws_message_unchecked()
            }
            LogMsg::Stderr(content) => {
                let index = counter.fetch_add(1, Ordering::SeqCst);
                let patch = ConversationPatch::add_stderr(index, content);
                LogMsg::JsonPatch(patch).to_ws_message_unchecked()
            }
            LogMsg::Finished => LogMsg::Finished.to_ws_message_unchecked(),
            _ => unreachable!("Raw stream should only have Stdout/Stderr/Finished"),
        }
    });

    loop {
        tokio::select! {
            item = stream.next() => {
                match item {
                    Some(Ok(msg)) => {
                        if socket.send(msg).await.is_err() {
                            break;
                        }
                    }
                    Some(Err(e)) => {
                        tracing::error!("stream error: {}", e);
                        break;
                    }
                    None => break,
                }
            }
            inbound = socket.recv() => {
                match inbound {
                    Ok(Some(Message::Close(_))) => break,
                    Ok(Some(_)) => {}
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
        }
    }
    // Send a proper close frame so the client sees code 1000 (normal closure)
    // instead of an abnormal TCP drop that triggers reconnection attempts.
    let _ = socket.close().await;
    Ok(())
}

async fn stream_normalized_logs_ws(
    ws: SignedWsUpgrade,
    State(deployment): State<DeploymentImpl>,
    Path(exec_id): Path<Uuid>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        let stream = deployment
            .container()
            .stream_normalized_logs(&exec_id)
            .await;

        match stream {
            Some(stream) => {
                let stream = stream.err_into::<anyhow::Error>().into_stream();
                if let Err(e) = handle_normalized_logs_ws(socket, stream).await {
                    tracing::warn!("normalized logs WS closed: {}", e);
                }
            }
            None => {
                // No logs available: send finished and close cleanly
                let mut socket = socket;
                let _ = socket
                    .send(utils::log_msg::LogMsg::Finished.to_ws_message_unchecked())
                    .await;
                let _ = socket.close().await;
            }
        }
    })
}

async fn handle_normalized_logs_ws(
    mut socket: MaybeSignedWebSocket,
    stream: impl futures_util::Stream<Item = anyhow::Result<LogMsg>> + Unpin + Send + 'static,
) -> anyhow::Result<()> {
    const PATCH_FLUSH_WINDOW_MS: u64 = 50;

    let mut stream = stream;
    let mut buffered_patch_ops: Vec<PatchOperation> = Vec::new();
    let mut flush_timer: Option<Pin<Box<Sleep>>> = None;

    let flush_buffered_patch = async |socket: &mut MaybeSignedWebSocket,
                                      buffered_patch_ops: &mut Vec<PatchOperation>|
           -> anyhow::Result<()> {
        if buffered_patch_ops.is_empty() {
            return Ok(());
        }

        let patch = Patch(coalesce_patch_ops(std::mem::take(buffered_patch_ops)));
        socket
            .send(LogMsg::JsonPatch(patch).to_ws_message_unchecked())
            .await?;
        Ok(())
    };

    loop {
        tokio::select! {
            _ = async {
                if let Some(timer) = flush_timer.as_mut() {
                    timer.await;
                }
            }, if flush_timer.is_some() => {
                flush_buffered_patch(&mut socket, &mut buffered_patch_ops).await?;
                flush_timer = None;
            }
            item = stream.next() => {
                match item {
                    Some(Ok(msg)) => {
                        match msg {
                            LogMsg::JsonPatch(patch) => {
                                buffered_patch_ops.extend(patch.0);
                                if flush_timer.is_none() {
                                    flush_timer = Some(Box::pin(tokio::time::sleep(Duration::from_millis(
                                        PATCH_FLUSH_WINDOW_MS,
                                    ))));
                                }
                            }
                            other => {
                                flush_buffered_patch(&mut socket, &mut buffered_patch_ops).await?;
                                flush_timer = None;
                                if socket.send(other.to_ws_message_unchecked()).await.is_err() {
                                    break;
                                }
                            }
                        }
                    }
                    Some(Err(e)) => {
                        let _ = flush_buffered_patch(&mut socket, &mut buffered_patch_ops).await;
                        tracing::error!("stream error: {}", e);
                        let _ = socket
                            .send(LogMsg::Finished.to_ws_message_unchecked())
                            .await;
                        break;
                    }
                    None => {
                        flush_buffered_patch(&mut socket, &mut buffered_patch_ops).await?;
                        break;
                    }
                }
            }
            inbound = socket.recv() => {
                match inbound {
                    Ok(Some(Message::Close(_))) => {
                        flush_buffered_patch(&mut socket, &mut buffered_patch_ops).await?;
                        break;
                    }
                    Ok(Some(_)) => {}
                    Ok(None) => {
                        flush_buffered_patch(&mut socket, &mut buffered_patch_ops).await?;
                        break;
                    }
                    Err(_) => {
                        flush_buffered_patch(&mut socket, &mut buffered_patch_ops).await?;
                        break;
                    }
                }
            }
        }
    }
    let _ = socket.close().await;
    Ok(())
}

fn coalesce_patch_ops(ops: Vec<PatchOperation>) -> Vec<PatchOperation> {
    use std::collections::HashMap;

    let mut last_index_by_path: HashMap<String, usize> = HashMap::new();
    for (index, op) in ops.iter().enumerate() {
        last_index_by_path.insert(op.path().to_string(), index);
    }

    let mut kept_indices: Vec<usize> = last_index_by_path.into_values().collect();
    kept_indices.sort_unstable();
    kept_indices
        .into_iter()
        .map(|index| ops[index].clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use json_patch::{AddOperation, PatchOperation, RemoveOperation, ReplaceOperation};
    use serde_json::json;

    use super::coalesce_patch_ops;

    #[test]
    fn coalesce_patch_ops_keeps_last_write_for_each_path() {
        let ops = vec![
            PatchOperation::Add(AddOperation {
                path: "/entries/5".parse().unwrap(),
                value: json!({"value": 1}),
            }),
            PatchOperation::Replace(ReplaceOperation {
                path: "/entries/5".parse().unwrap(),
                value: json!({"value": 2}),
            }),
            PatchOperation::Add(AddOperation {
                path: "/entries/6".parse().unwrap(),
                value: json!({"value": 3}),
            }),
        ];

        let coalesced = coalesce_patch_ops(ops);

        assert_eq!(coalesced.len(), 2);
        assert_eq!(coalesced[0].path(), "/entries/5");
        assert_eq!(coalesced[1].path(), "/entries/6");
        match &coalesced[0] {
            PatchOperation::Replace(op) => assert_eq!(op.value, json!({"value": 2})),
            other => panic!("expected replace op, got {other:?}"),
        }
    }

    #[test]
    fn coalesce_patch_ops_preserves_last_operation_kind() {
        let ops = vec![
            PatchOperation::Add(AddOperation {
                path: "/entries/7".parse().unwrap(),
                value: json!({"value": 1}),
            }),
            PatchOperation::Remove(RemoveOperation {
                path: "/entries/7".parse().unwrap(),
            }),
        ];

        let coalesced = coalesce_patch_ops(ops);

        assert_eq!(coalesced.len(), 1);
        assert!(matches!(coalesced[0], PatchOperation::Remove(_)));
        assert_eq!(coalesced[0].path(), "/entries/7");
    }
}

async fn stop_execution_process(
    Extension(execution_process): Extension<ExecutionProcess>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    deployment
        .container()
        .stop_execution(&execution_process, ExecutionProcessStatus::Killed)
        .await?;

    Ok(ResponseJson(ApiResponse::success(())))
}

async fn stream_execution_processes_by_session_ws(
    ws: SignedWsUpgrade,
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<SessionExecutionProcessQuery>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_execution_processes_by_session_ws(
            socket,
            deployment,
            query.session_id,
            query.show_soft_deleted.unwrap_or(false),
        )
        .await
        {
            tracing::warn!("execution processes by session WS closed: {}", e);
        }
    })
}

async fn handle_execution_processes_by_session_ws(
    mut socket: MaybeSignedWebSocket,
    deployment: DeploymentImpl,
    session_id: uuid::Uuid,
    show_soft_deleted: bool,
) -> anyhow::Result<()> {
    // Get the raw stream and convert LogMsg to WebSocket messages
    let mut stream = deployment
        .events()
        .stream_execution_processes_for_session_raw(session_id, show_soft_deleted)
        .await?
        .map_ok(|msg| msg.to_ws_message_unchecked());

    loop {
        tokio::select! {
            item = stream.next() => {
                match item {
                    Some(Ok(msg)) => {
                        if socket.send(msg).await.is_err() {
                            break;
                        }
                    }
                    Some(Err(e)) => {
                        tracing::error!("stream error: {}", e);
                        break;
                    }
                    None => break,
                }
            }
            inbound = socket.recv() => {
                match inbound {
                    Ok(Some(Message::Close(_))) => break,
                    Ok(Some(_)) => {}
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
        }
    }
    Ok(())
}

async fn get_execution_process_repo_states(
    Extension(execution_process): Extension<ExecutionProcess>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<ExecutionProcessRepoState>>>, ApiError> {
    let pool = &deployment.db().pool;
    let repo_states =
        ExecutionProcessRepoState::find_by_execution_process_id(pool, execution_process.id).await?;
    Ok(ResponseJson(ApiResponse::success(repo_states)))
}

pub(super) fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let workspace_id_router = Router::new()
        .route("/", get(get_execution_process_by_id))
        .route("/stop", post(stop_execution_process))
        .route("/repo-states", get(get_execution_process_repo_states))
        .route("/raw-logs/ws", get(stream_raw_logs_ws))
        .route("/normalized-logs/ws", get(stream_normalized_logs_ws))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_execution_process_middleware,
        ));

    let workspaces_router = Router::new()
        .route(
            "/stream/session/ws",
            get(stream_execution_processes_by_session_ws),
        )
        .nest("/{id}", workspace_id_router);

    Router::new().nest("/execution-processes", workspaces_router)
}
