use axum::{
    Extension, Json, Router,
    extract::State,
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post},
};
use db::models::{scratch::DraftFollowUpData, session::Session};
use deployment::Deployment;
use executors::profile::ExecutorConfig;
use serde::{Deserialize, Serialize};
use services::services::queued_message::{QueueStatus, QueuedMessage};
use ts_rs::TS;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError, middleware::load_session_middleware};

/// Request body for queueing a follow-up message
#[derive(Debug, Deserialize, TS)]
pub struct QueueMessageRequest {
    pub message: String,
    pub executor_config: ExecutorConfig,
}

#[derive(Debug, Serialize, TS)]
pub struct CancelQueueResponse {
    pub status: QueueStatus,
    pub cancelled_message: Option<QueuedMessage>,
}

/// Queue a follow-up message to be executed when the current execution finishes
pub async fn queue_message(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<QueueMessageRequest>,
) -> Result<ResponseJson<ApiResponse<QueueStatus>>, ApiError> {
    let data = DraftFollowUpData {
        message: payload.message,
        executor_config: payload.executor_config,
    };

    let queued = deployment
        .queued_message_service()
        .queue_message(session.id, data);

    deployment
        .track_if_analytics_allowed(
            "follow_up_queued",
            serde_json::json!({
                "session_id": session.id.to_string(),
                "workspace_id": session.workspace_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(
        deployment
            .queued_message_service()
            .get_status(queued.session_id),
    )))
}

/// Queue a steer message with higher priority than buffered queue messages
pub async fn queue_steer_message(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<QueueMessageRequest>,
) -> Result<ResponseJson<ApiResponse<QueueStatus>>, ApiError> {
    let data = DraftFollowUpData {
        message: payload.message,
        executor_config: payload.executor_config,
    };

    let queued = deployment
        .queued_message_service()
        .queue_steer(session.id, data);

    deployment
        .track_if_analytics_allowed(
            "follow_up_steered",
            serde_json::json!({
                "session_id": session.id.to_string(),
                "workspace_id": session.workspace_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(
        deployment
            .queued_message_service()
            .get_status(queued.session_id),
    )))
}

/// Pop the latest queued follow-up message for editor restore
pub async fn cancel_queued_message(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<CancelQueueResponse>>, ApiError> {
    let cancelled_message = deployment
        .queued_message_service()
        .cancel_latest(session.id);

    deployment
        .track_if_analytics_allowed(
            "follow_up_queue_cancelled",
            serde_json::json!({
                "session_id": session.id.to_string(),
                "workspace_id": session.workspace_id.to_string(),
            }),
        )
        .await;

    let status = deployment.queued_message_service().get_status(session.id);

    Ok(ResponseJson(ApiResponse::success(CancelQueueResponse {
        status,
        cancelled_message,
    })))
}

/// Get the current queue status for a session's workspace
pub async fn get_queue_status(
    Extension(session): Extension<Session>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<QueueStatus>>, ApiError> {
    let status = deployment.queued_message_service().get_status(session.id);

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
        .route("/steer", post(queue_steer_message))
        .layer(from_fn_with_state(
            deployment.clone(),
            load_session_middleware,
        ))
}
