use axum::{
    extract::{Path, Query, State},
    middleware::from_fn_with_state,
    response::{
        sse::{Event, KeepAlive},
        Json as ResponseJson, Sse,
    },
    routing::{get, post},
    BoxError, Extension, Router,
};
use db::models::execution_process::ExecutionProcess;
use deployment::Deployment;
use futures_util::TryStreamExt;
use serde::Deserialize;
use services::services::container::ContainerService;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{error::ApiError, middleware::load_execution_process_middleware, DeploymentImpl};

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

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let task_attempt_id_router = Router::new()
        .route("/", get(get_execution_process_by_id))
        .route("/stop", post(stop_execution_process))
        .route("/raw-logs", get(stream_raw_logs))
        .route("/normalized-logs", get(stream_normalized_logs))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_execution_process_middleware,
        ));

    let task_attempts_router = Router::new()
        .route("/", get(get_execution_processes))
        .nest("/{id}", task_attempt_id_router);

    Router::new().nest("/execution-processes", task_attempts_router)
}
