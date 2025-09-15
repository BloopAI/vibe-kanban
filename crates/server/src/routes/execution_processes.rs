use anyhow;
use axum::{
    BoxError, Extension, Router,
    extract::{
        Path, Query, State,
        ws::{WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    middleware::from_fn_with_state,
    response::{
        IntoResponse, Json as ResponseJson, Sse,
        sse::{Event, KeepAlive},
    },
    routing::{get, post},
};
use db::models::execution_process::ExecutionProcess;
use deployment::Deployment;
use futures_util::{SinkExt, Stream, StreamExt, TryStreamExt};
use serde::Deserialize;
use services::services::container::ContainerService;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_execution_process_middleware};

#[derive(Debug, Deserialize)]
pub struct ExecutionProcessQuery {
    pub task_attempt_id: Uuid,
}

pub async fn get_execution_processes(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ExecutionProcessQuery>,
) -> Result<ResponseJson<ApiResponse<Vec<ExecutionProcess>>>, ApiError> {
    let pool = &deployment.db().pool;
    let execution_processes =
        ExecutionProcess::find_by_task_attempt_id(pool, query.task_attempt_id).await?;

    Ok(ResponseJson(ApiResponse::success(execution_processes)))
}

pub async fn get_execution_process_by_id(
    Extension(execution_process): Extension<ExecutionProcess>,
    State(_deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<ExecutionProcess>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(execution_process)))
}

pub async fn stream_raw_logs(
    State(deployment): State<DeploymentImpl>,
    Path(exec_id): Path<Uuid>,
) -> Result<Sse<impl futures_util::Stream<Item = Result<Event, BoxError>>>, axum::http::StatusCode>
{
    // Ask the container service for a combined "history + live" stream
    let stream = deployment
        .container()
        .stream_raw_logs(&exec_id)
        .await
        .ok_or(axum::http::StatusCode::NOT_FOUND)?;

    Ok(Sse::new(stream.map_err(|e| -> BoxError { e.into() })).keep_alive(KeepAlive::default()))
}

pub async fn stream_normalized_logs(
    State(deployment): State<DeploymentImpl>,
    Path(exec_id): Path<Uuid>,
) -> Result<Sse<impl futures_util::Stream<Item = Result<Event, BoxError>>>, axum::http::StatusCode>
{
    // Ask the container service for a combined "history + live" stream
    let stream = deployment
        .container()
        .stream_normalized_logs(&exec_id)
        .await
        .ok_or(axum::http::StatusCode::NOT_FOUND)?;

    Ok(Sse::new(stream.map_err(|e| -> BoxError { e.into() })).keep_alive(KeepAlive::default()))
}

pub async fn stream_normalized_logs_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
    Path(exec_id): Path<Uuid>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_normalized_logs_ws(socket, deployment, exec_id).await {
            tracing::warn!("normalized logs WS closed: {}", e);
        }
    })
}

async fn handle_normalized_logs_ws(
    socket: WebSocket,
    deployment: DeploymentImpl,
    exec_id: Uuid,
) -> anyhow::Result<()> {
    // Get the raw stream and convert LogMsg to WebSocket messages
    let mut stream = deployment
        .container()
        .stream_normalized_logs_raw(&exec_id)
        .await
        .ok_or_else(|| anyhow::anyhow!("Execution process not found"))?
        .map_ok(|msg| msg.to_ws_message_unchecked());

    // Split socket into sender and receiver
    let (mut sender, mut receiver) = socket.split();

    // Drain (and ignore) any client->server messages so pings/pongs work
    tokio::spawn(async move { while let Some(Ok(_)) = receiver.next().await {} });

    // Forward server messages
    while let Some(item) = stream.next().await {
        match item {
            Ok(msg) => {
                if sender.send(msg).await.is_err() {
                    break; // client disconnected
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

pub async fn stop_execution_process(
    Extension(execution_process): Extension<ExecutionProcess>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    deployment
        .container()
        .stop_execution(&execution_process)
        .await?;

    Ok(ResponseJson(ApiResponse::success(())))
}

pub async fn stream_execution_processes(
    State(deployment): State<DeploymentImpl>,
    Query(query): Query<ExecutionProcessQuery>,
) -> Result<Sse<impl Stream<Item = Result<Event, BoxError>>>, StatusCode> {
    let stream = deployment
        .events()
        .stream_execution_processes_for_attempt(query.task_attempt_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Sse::new(stream.map_err(|e| -> BoxError { e.into() })).keep_alive(KeepAlive::default()))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let task_attempt_id_router = Router::new()
        .route("/", get(get_execution_process_by_id))
        .route("/stop", post(stop_execution_process))
        .route("/raw-logs", get(stream_raw_logs))
        .route("/normalized-logs", get(stream_normalized_logs))
        .route("/normalized-logs/ws", get(stream_normalized_logs_ws))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_execution_process_middleware,
        ));

    let task_attempts_router = Router::new()
        .route("/", get(get_execution_processes))
        .route("/stream", get(stream_execution_processes))
        .nest("/{id}", task_attempt_id_router);

    Router::new().nest("/execution-processes", task_attempts_router)
}
