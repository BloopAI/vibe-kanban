use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use db::models::execution_process::ExecutionProcess;
use deployment::Deployment;
use services::services::container::ContainerService;
use utils::approvals::{
    ApprovalPendingInfo, ApprovalRequest, ApprovalResponse, ApprovalStatus, CreateApprovalRequest,
    EXIT_PLAN_MODE_TOOL_NAME,
};

use crate::DeploymentImpl;

pub async fn create_approval(
    State(deployment): State<DeploymentImpl>,
    Json(request): Json<CreateApprovalRequest>,
) -> Result<Json<ApprovalRequest>, StatusCode> {
    let service = deployment.approvals();

    match service
        .create_from_session(&deployment.db().pool, request)
        .await
    {
        Ok(approval) => {
            deployment
                .track_if_analytics_allowed(
                    "approval_created",
                    serde_json::json!({
                        "approval_id": approval.id,
                        "tool_name": &approval.tool_name,
                        "execution_process_id": approval.execution_process_id.to_string(),
                    }),
                )
                .await;

            Ok(Json(approval))
        }
        Err(e) => {
            tracing::error!("Failed to create approval: {:?}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_approval_status(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<String>,
) -> Result<Json<ApprovalStatus>, StatusCode> {
    let service = deployment.approvals();
    match service.status(&id).await {
        Some(status) => Ok(Json(status)),
        None => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn respond_to_approval(
    State(deployment): State<DeploymentImpl>,
    Path(id): Path<String>,
    Json(request): Json<ApprovalResponse>,
) -> Result<Json<ApprovalStatus>, StatusCode> {
    let service = deployment.approvals();

    match service.respond(&deployment.db().pool, &id, request).await {
        Ok((status, context)) => {
            deployment
                .track_if_analytics_allowed(
                    "approval_responded",
                    serde_json::json!({
                        "approval_id": &id,
                        "status": format!("{:?}", status),
                        "tool_name": context.tool_name,
                        "execution_process_id": context.execution_process_id.to_string(),
                    }),
                )
                .await;

            if matches!(status, ApprovalStatus::Approved)
                && context.tool_name == EXIT_PLAN_MODE_TOOL_NAME
                // If exiting plan mode, automatically start a new execution process with different
                // permissions
                && let Ok(ctx) = ExecutionProcess::load_context(
                    &deployment.db().pool,
                    context.execution_process_id,
                )
                .await
                && let Err(e) = deployment.container().exit_plan_mode_tool(ctx).await
            {
                tracing::error!("failed to exit plan mode: {:?}", e);
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }

            Ok(Json(status))
        }
        Err(e) => {
            tracing::error!("Failed to respond to approval: {:?}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn get_pending_approvals(
    State(deployment): State<DeploymentImpl>,
) -> Json<Vec<ApprovalPendingInfo>> {
    let service = deployment.approvals();
    let approvals = service.pending().await;
    Json(approvals)
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/approvals/create", post(create_approval))
        .route("/approvals/{id}/status", get(get_approval_status))
        .route("/approvals/{id}/respond", post(respond_to_approval))
        .route("/approvals/pending", get(get_pending_approvals))
}
