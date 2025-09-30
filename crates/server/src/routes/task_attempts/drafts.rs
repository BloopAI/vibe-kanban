use axum::{Extension, Json, extract::State, response::Json as ResponseJson};
use db::models::{
    draft::DraftType,
    task_attempt::{TaskAttempt, TaskAttemptError},
};
use deployment::Deployment;
use serde::Deserialize;
use services::services::drafts::{
    DraftResponse, SetQueueRequest, UpdateFollowUpDraftRequest, UpdateRetryFollowUpDraftRequest,
};
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Debug, Deserialize)]
pub struct DraftTypeQuery {
    #[serde(rename = "type")]
    pub draft_type: DraftType,
}

#[axum::debug_handler]
pub async fn save_follow_up_draft(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateFollowUpDraftRequest>,
) -> Result<ResponseJson<ApiResponse<DraftResponse>>, ApiError> {
    let service = deployment.drafts();
    let resp = service
        .save_follow_up_draft(&task_attempt, &payload)
        .await?;
    Ok(ResponseJson(ApiResponse::success(resp)))
}

#[axum::debug_handler]
pub async fn save_retry_follow_up_draft(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateRetryFollowUpDraftRequest>,
) -> Result<ResponseJson<ApiResponse<DraftResponse>>, ApiError> {
    let service = deployment.drafts();
    let resp = service
        .save_retry_follow_up_draft(&task_attempt, &payload)
        .await?;
    Ok(ResponseJson(ApiResponse::success(resp)))
}

#[axum::debug_handler]
pub async fn delete_retry_follow_up_draft(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let service = deployment.drafts();
    service.delete_retry_follow_up_draft(&task_attempt).await?;
    Ok(ResponseJson(ApiResponse::success(())))
}

#[axum::debug_handler]
pub async fn set_follow_up_queue(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<SetQueueRequest>,
) -> Result<ResponseJson<ApiResponse<DraftResponse>>, ApiError> {
    let service = deployment.drafts();
    let resp = service
        .set_follow_up_queue(deployment.container(), &task_attempt, &payload)
        .await?;
    Ok(ResponseJson(ApiResponse::success(resp)))
}

#[axum::debug_handler]
pub async fn get_draft(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    axum::extract::Query(q): axum::extract::Query<DraftTypeQuery>,
) -> Result<ResponseJson<ApiResponse<DraftResponse>>, ApiError> {
    let service = deployment.drafts();
    let resp = service.get_draft(task_attempt.id, q.draft_type).await?;
    Ok(ResponseJson(ApiResponse::success(resp)))
}

#[axum::debug_handler]
pub async fn save_draft(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    axum::extract::Query(q): axum::extract::Query<DraftTypeQuery>,
    Json(payload): Json<serde_json::Value>,
) -> Result<ResponseJson<ApiResponse<DraftResponse>>, ApiError> {
    let service = deployment.drafts();
    match q.draft_type {
        DraftType::FollowUp => {
            let body: UpdateFollowUpDraftRequest =
                serde_json::from_value(payload).map_err(|e| {
                    ApiError::TaskAttempt(TaskAttemptError::ValidationError(e.to_string()))
                })?;
            let resp = service.save_follow_up_draft(&task_attempt, &body).await?;
            Ok(ResponseJson(ApiResponse::success(resp)))
        }
        DraftType::Retry => {
            let body: UpdateRetryFollowUpDraftRequest =
                serde_json::from_value(payload).map_err(|e| {
                    ApiError::TaskAttempt(TaskAttemptError::ValidationError(e.to_string()))
                })?;
            let resp = service
                .save_retry_follow_up_draft(&task_attempt, &body)
                .await?;
            Ok(ResponseJson(ApiResponse::success(resp)))
        }
    }
}

#[axum::debug_handler]
pub async fn delete_draft(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    axum::extract::Query(q): axum::extract::Query<DraftTypeQuery>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let service = deployment.drafts();
    match q.draft_type {
        DraftType::FollowUp => Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "Cannot delete follow-up draft; unqueue or edit instead".to_string(),
        ))),
        DraftType::Retry => {
            service.delete_retry_follow_up_draft(&task_attempt).await?;
            Ok(ResponseJson(ApiResponse::success(())))
        }
    }
}

#[axum::debug_handler]
pub async fn set_draft_queue(
    Extension(task_attempt): Extension<TaskAttempt>,
    State(deployment): State<DeploymentImpl>,
    axum::extract::Query(q): axum::extract::Query<DraftTypeQuery>,
    Json(payload): Json<SetQueueRequest>,
) -> Result<ResponseJson<ApiResponse<DraftResponse>>, ApiError> {
    if q.draft_type != DraftType::FollowUp {
        return Err(ApiError::TaskAttempt(TaskAttemptError::ValidationError(
            "Queue is only supported for follow-up drafts".to_string(),
        )));
    }

    let service = deployment.drafts();
    let resp = service
        .set_follow_up_queue(deployment.container(), &task_attempt, &payload)
        .await?;
    Ok(ResponseJson(ApiResponse::success(resp)))
}
