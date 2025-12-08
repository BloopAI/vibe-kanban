use axum::{
    Extension, Json, Router, extract::State, middleware::from_fn_with_state,
    response::Json as ResponseJson, routing::get,
};
use db::models::{scratch::DraftFollowUpData, task_attempt::TaskAttempt};
use deployment::Deployment;
use serde::Deserialize;
use services::services::queued_message::QueueStatus;
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError, middleware::load_task_attempt_middleware};

/// Request body for queueing a follow-up message
#[derive(Debug, Deserialize, TS)]
pub struct QueueMessageRequest {
    pub message: String,
    pub variant: Option<String>,
}

/// Queue a follow-up message to be executed when the current execution finishes
pub async fn queue_message(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<QueueMessageRequest>,
) -> Result<ResponseJson<ApiResponse<QueueStatus>>, ApiError> {
    let data = DraftFollowUpData {
        message: payload.message,
        variant: payload.variant,
    };

    let queued = deployment
        .queued_message_service()
        .queue_message(task_attempt.id, data);

    deployment
        .track_if_analytics_allowed(
            "follow_up_queued",
            serde_json::json!({
                "attempt_id": task_attempt.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(QueueStatus::Queued {
        message: queued,
    })))
}

/// Cancel a queued follow-up message
pub async fn cancel_queued_message(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<QueueStatus>>, ApiError> {
    deployment
        .queued_message_service()
        .cancel_queued(task_attempt.id);

    deployment
        .track_if_analytics_allowed(
            "follow_up_queue_cancelled",
            serde_json::json!({
                "attempt_id": task_attempt.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(QueueStatus::Empty)))
}

/// Get the current queue status for a task attempt
pub async fn get_queue_status(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<QueueStatus>>, ApiError> {
    let status = deployment
        .queued_message_service()
        .get_status(task_attempt.id);

    Ok(ResponseJson(ApiResponse::success(status)))
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route(
            "/",
            get(get_queue_status)
                .post(queue_message)
                .delete(cancel_queued_message),
        )
        .layer(from_fn_with_state(
            deployment.clone(),
            load_task_attempt_middleware,
        ))
}
